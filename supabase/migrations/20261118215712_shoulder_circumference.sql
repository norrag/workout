-- Add a shoulder circumference site; preserve every existing reading and site key.
-- All three existing owner-scoped invoker writers must accept a full 13-site session.
insert into public.measurement_sites (key, display_order) values ('shoulders', 13);

create or replace function public.save_measurement_session(
  p_id uuid, p_measured_on date, p_input_unit text, p_note text, p_readings jsonb
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_measured_on > current_date + 1 then raise exception 'Future measurement date' using errcode = '22023'; end if;
  if jsonb_typeof(p_readings) is distinct from 'array' then
    raise exception 'Readings must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_readings) < 1 or jsonb_array_length(p_readings) > 13 then
    raise exception 'Enter 1 to 13 readings' using errcode = '22023';
  end if;
  insert into public.measurement_sessions (id, user_id, measured_on, input_unit, note)
    values (p_id, auth.uid(), p_measured_on, p_input_unit, p_note)
    on conflict (id) do update set
      measured_on = excluded.measured_on, input_unit = excluded.input_unit, note = excluded.note
    where measurement_sessions.user_id = auth.uid();
  if not found then raise exception 'Session unavailable' using errcode = '42501'; end if;
  delete from public.measurements where session_id = p_id and user_id = auth.uid();
  insert into public.measurements (session_id, user_id, site_key, value_in)
    select p_id, auth.uid(), r.site_key, r.value_in
    from jsonb_to_recordset(p_readings) as r(site_key text, value_in numeric);
end;
$$;
revoke all on function public.save_measurement_session(uuid,date,text,text,jsonb) from public, anon;
grant execute on function public.save_measurement_session(uuid,date,text,text,jsonb) to authenticated;


-- Append-only, atomic tape imports. Existing dates are never overwritten.
-- A date is the natural idempotency key; exact retries are no-ops.
create or replace function public.import_measurement_sessions(p_sessions jsonb, p_commit boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  s jsonb; r jsonb; d date; existing public.measurement_sessions;
  sid uuid; canonical jsonb; stored jsonb; result jsonb := '[]'; status text;
begin
  if p_commit is null then raise exception 'Commit must be true or false'; end if;
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if jsonb_typeof(p_sessions) is distinct from 'array' then raise exception 'Sessions must be an array'; end if;
  if jsonb_array_length(p_sessions) not between 1 and 100 then raise exception 'Enter 1 to 100 sessions'; end if;
  if (select count(distinct v->>'measured_on') from jsonb_array_elements(p_sessions) v) <> jsonb_array_length(p_sessions) then
    raise exception 'Dates must be unique';
  end if;
  -- Serialize imports per owner; unique date constraint also protects races with app saves.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 240));
  for s in select value from jsonb_array_elements(p_sessions) order by value->>'measured_on' loop
    if jsonb_typeof(s) is distinct from 'object' or s - array['measured_on','input_unit','note','readings'] <> '{}'::jsonb then raise exception 'Invalid session fields'; end if;
    if s->>'measured_on' is null or s->>'measured_on' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
    d := (s->>'measured_on')::date;
    if d < date '1900-01-01' or d > current_date + 1 then raise exception 'Invalid measurement date'; end if;
    if s->>'input_unit' is null or s->>'input_unit' not in ('in','cm') or jsonb_typeof(s->'note') is distinct from 'string' or length(s->>'note') > 500 then raise exception 'Invalid unit or note'; end if;
    if jsonb_typeof(s->'readings') is distinct from 'array' then raise exception 'Readings must be an array'; end if;
    if jsonb_array_length(s->'readings') not between 1 and 13 then raise exception 'Enter 1 to 13 readings'; end if;
    if (select count(distinct v->>'site_key') from jsonb_array_elements(s->'readings') v) <> jsonb_array_length(s->'readings') then raise exception 'Sites must be unique'; end if;
    for r in select value from jsonb_array_elements(s->'readings') loop
      if jsonb_typeof(r) is distinct from 'object' or r - array['site_key','value_in'] <> '{}'::jsonb then raise exception 'Invalid reading fields'; end if;
      if not exists(select 1 from public.measurement_sites where key = r->>'site_key') then raise exception 'Unknown measurement site'; end if;
      if jsonb_typeof(r->'value_in') is distinct from 'number' then raise exception 'Invalid value'; end if;
      if (r->>'value_in')::numeric <= 0 or (r->>'value_in')::numeric > 150 or round((r->>'value_in')::numeric,4) <= 0 then raise exception 'Invalid value'; end if;
    end loop;
    select jsonb_agg(jsonb_build_object('site_key',v->>'site_key','value_in',round((v->>'value_in')::numeric,4)) order by v->>'site_key')
      into canonical from jsonb_array_elements(s->'readings') v;
    select * into existing from public.measurement_sessions where user_id=auth.uid() and measured_on=d for update;
    if found then
      select jsonb_agg(jsonb_build_object('site_key',site_key,'value_in',value_in) order by site_key)
        into stored from public.measurements where user_id=auth.uid() and session_id=existing.id;
      if existing.input_unit <> s->>'input_unit' or existing.note <> s->>'note' or stored is distinct from canonical then
        raise exception 'Measurement conflict on %; no sessions imported. Review the existing date in the app.', d using errcode='23505';
      end if;
      sid := existing.id; status := 'unchanged';
    else
      sid := null; status := 'would_insert';
      if p_commit then
        insert into public.measurement_sessions(user_id,measured_on,input_unit,note)
          values(auth.uid(),d,s->>'input_unit',s->>'note') returning id into sid;
        insert into public.measurements(session_id,user_id,site_key,value_in)
          select sid,auth.uid(),v->>'site_key',(v->>'value_in')::numeric from jsonb_array_elements(canonical) v;
        status := 'inserted';
      end if;
    end if;
    result := result || jsonb_build_array(jsonb_build_object('date',d,'session_id',sid,'status',status));
  end loop;
  return jsonb_build_object('committed',p_commit,'sessions',result);
end; $$;
revoke all on function public.import_measurement_sessions(jsonb,boolean) from public, anon;
grant execute on function public.import_measurement_sessions(jsonb,boolean) to authenticated;

-- Owner-only compare-and-swap correction/deletion of one tape session.
-- Expected snapshots prevent assistants from overwriting newer app edits.
create or replace function public.mutate_measurement_session(
  p_id uuid, p_expected jsonb, p_replacement jsonb default null,
  p_commit boolean default false, p_delete boolean default false,
  p_confirm_delete boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  payload jsonb; reading jsonb; snapshots jsonb := '[]'::jsonb;
  canonical jsonb; expected jsonb; replacement jsonb; current_snapshot jsonb;
  current_row public.measurement_sessions; result_status text; d date;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_id is null or p_commit is null or p_delete is null or p_confirm_delete is null then
    raise exception 'Target and flags must not be null' using errcode='22023';
  end if;
  if p_delete and p_replacement is not null then raise exception 'Deletion cannot include a replacement' using errcode='22023'; end if;
  if not p_delete and p_replacement is null then raise exception 'Update requires a replacement' using errcode='22023'; end if;
  if not p_delete and p_confirm_delete then raise exception 'Delete confirmation is only valid for deletion' using errcode='22023'; end if;
  if p_delete and p_commit and not p_confirm_delete then raise exception 'Explicit deletion confirmation required' using errcode='22023'; end if;

  -- Validate every boundary, including direct RPC calls. Do not trust the MCP parser.
  for payload in select value from jsonb_array_elements(
    case when p_delete then jsonb_build_array(p_expected) else jsonb_build_array(p_expected,p_replacement) end
  ) loop
    if jsonb_typeof(payload) is distinct from 'object' or payload - array['measured_on','input_unit','note','readings'] <> '{}'::jsonb then
      raise exception 'Invalid session fields' using errcode='22023';
    end if;
    if jsonb_typeof(payload->'measured_on') is distinct from 'string' or payload->>'measured_on' !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Invalid date' using errcode='22023';
    end if;
    d := (payload->>'measured_on')::date;
    if d < date '1900-01-01' or d > current_date + 1 then raise exception 'Invalid measurement date' using errcode='22023'; end if;
    if payload->>'input_unit' is null or payload->>'input_unit' not in ('in','cm') or jsonb_typeof(payload->'note') is distinct from 'string' or length(payload->>'note') > 500 then
      raise exception 'Invalid unit or note' using errcode='22023';
    end if;
    if jsonb_typeof(payload->'readings') is distinct from 'array' then raise exception 'Readings must be an array' using errcode='22023'; end if;
    if jsonb_array_length(payload->'readings') not between 1 and 13 then raise exception 'Enter 1 to 13 readings' using errcode='22023'; end if;
    if (select count(distinct v->>'site_key') from jsonb_array_elements(payload->'readings') v) <> jsonb_array_length(payload->'readings') then
      raise exception 'Sites must be unique' using errcode='22023';
    end if;
    for reading in select value from jsonb_array_elements(payload->'readings') loop
      if jsonb_typeof(reading) is distinct from 'object' or reading - array['site_key','value_in'] <> '{}'::jsonb then raise exception 'Invalid reading fields' using errcode='22023'; end if;
      if not exists(select 1 from public.measurement_sites where key = reading->>'site_key') then raise exception 'Unknown measurement site' using errcode='22023'; end if;
      if jsonb_typeof(reading->'value_in') is distinct from 'number' then raise exception 'Invalid value' using errcode='22023'; end if;
      if (reading->>'value_in')::numeric <= 0 or (reading->>'value_in')::numeric > 150 or round((reading->>'value_in')::numeric,4) <= 0 then raise exception 'Invalid value' using errcode='22023'; end if;
    end loop;
    select jsonb_build_object('measured_on',d,'input_unit',payload->>'input_unit','note',payload->>'note',
      'readings',jsonb_agg(jsonb_build_object('site_key',v->>'site_key','value_in',round((v->>'value_in')::numeric,4)) order by v->>'site_key'))
      into canonical from jsonb_array_elements(payload->'readings') v;
    snapshots := snapshots || jsonb_build_array(canonical);
  end loop;
  expected := snapshots->0;
  replacement := case when p_delete then null else snapshots->1 end;

  -- Same owner lock/order as imports. App saves also lock the session header.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,240));
  select * into current_row from public.measurement_sessions
    where id=p_id and user_id=auth.uid() for update;
  if not found then raise exception 'Measurement session unavailable' using errcode='P0002'; end if;
  select jsonb_build_object('measured_on',current_row.measured_on,'input_unit',current_row.input_unit,'note',current_row.note,
    'readings',jsonb_agg(jsonb_build_object('site_key',site_key,'value_in',value_in) order by site_key))
    into current_snapshot from public.measurements where session_id=p_id and user_id=auth.uid();

  if not p_delete and current_snapshot = replacement then
    -- An exact update retry is a no-op, even if its old expected snapshot is stale.
    result_status := 'unchanged';
  else
    if current_snapshot is distinct from expected then
      raise exception 'Measurement session changed; read and review it again. Nothing changed.' using errcode='40001';
    end if;
    if p_delete then
      result_status := 'would_delete';
      if p_commit then
        delete from public.measurement_sessions where id=p_id and user_id=auth.uid();
        result_status := 'deleted';
      end if;
    else
      -- Preflight the destination date so preview does not promise an impossible move.
      if exists(select 1 from public.measurement_sessions where user_id=auth.uid() and measured_on=(replacement->>'measured_on')::date and id<>p_id) then
        raise exception 'Another session already uses that date. Nothing changed.' using errcode='23505';
      end if;
      result_status := 'would_update';
      if p_commit then
        perform public.save_measurement_session(p_id,(replacement->>'measured_on')::date,
          replacement->>'input_unit',replacement->>'note',replacement->'readings');
        result_status := 'updated';
      end if;
    end if;
  end if;
  return jsonb_build_object('committed',p_commit,'status',result_status,'session_id',p_id,
    'current',current_snapshot || jsonb_build_object('id',p_id),
    'proposed',case when p_delete then null else replacement || jsonb_build_object('id',p_id) end);
end; $$;
revoke all on function public.mutate_measurement_session(uuid,jsonb,jsonb,boolean,boolean,boolean) from public, anon;
grant execute on function public.mutate_measurement_session(uuid,jsonb,jsonb,boolean,boolean,boolean) to authenticated;
