-- Doc 24: additive owner-private tape history. No existing row or engine input changes.
create table public.measurement_sites (
  key text primary key,
  display_order integer not null unique
);
alter table public.measurement_sites enable row level security;
create policy measurement_sites_read on public.measurement_sites
  for select to authenticated using (true);
revoke all on public.measurement_sites from anon, authenticated;
grant select on public.measurement_sites to authenticated;
insert into public.measurement_sites (key, display_order) values
  ('chest',1), ('waist_navel',2), ('upper_arm_left',3), ('upper_arm_right',4),
  ('thigh_left',5), ('thigh_right',6), ('hips',7), ('calf_left',8), ('calf_right',9),
  ('neck',10), ('forearm_left',11), ('forearm_right',12);

create table public.measurement_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  measured_on date not null check (measured_on >= date '1900-01-01'),
  input_unit text not null check (input_unit in ('in','cm')),
  note text not null default '' check (length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, measured_on)
);
alter table public.measurement_sessions enable row level security;
create policy measurement_sessions_own on public.measurement_sessions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.measurement_sessions from anon, authenticated;
grant select, insert, update, delete on public.measurement_sessions to authenticated;
create trigger measurement_sessions_updated_at before update on public.measurement_sessions
  for each row execute function public.set_updated_at();

create table public.measurements (
  session_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  site_key text not null references public.measurement_sites(key),
  value_in numeric(8,4) not null check (value_in > 0 and value_in <= 150),
  primary key (session_id, site_key),
  foreign key (session_id, user_id) references public.measurement_sessions(id, user_id) on delete cascade
);
create index measurements_user_idx on public.measurements(user_id);
create index measurements_site_idx on public.measurements(site_key);
alter table public.measurements enable row level security;
create policy measurements_own on public.measurements
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.measurements from anon, authenticated;
grant select, insert, update, delete on public.measurements to authenticated;

-- One transaction: either header and every reading land, or none of them do.
-- No user-id parameter; invoker rights preserve the same RLS at every statement.
create function public.save_measurement_session(
  p_id uuid, p_measured_on date, p_input_unit text, p_note text, p_readings jsonb
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_measured_on > current_date + 1 then raise exception 'Future measurement date' using errcode = '22023'; end if;
  if jsonb_typeof(p_readings) is distinct from 'array' then
    raise exception 'Readings must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_readings) < 1 or jsonb_array_length(p_readings) > 12 then
    raise exception 'Enter 1 to 12 readings' using errcode = '22023';
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

comment on table public.measurement_sessions is 'Owner-private dated tape sessions (doc 24). Measurement substrate only; never an engine or profile input.';
comment on table public.measurements is 'Raw circumference in inches, identified by landmark and side. No inferred composition or interpolated observations.';
