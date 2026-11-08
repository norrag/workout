-- Append-only, atomic tape imports. Existing dates are never overwritten.
-- A date is the natural idempotency key; exact retries are no-ops.
create function public.import_measurement_sessions(p_sessions jsonb, p_commit boolean default false)
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
    if jsonb_array_length(s->'readings') not between 1 and 12 then raise exception 'Enter 1 to 12 readings'; end if;
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
