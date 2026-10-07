create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (char_length(btrim(username)) between 1 and 64),
  created_at timestamptz not null default now()
);

create unique index profiles_username_lower_unique
  on public.profiles (lower(username));

create or replace function public.create_scorelytics_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
begin
  requested_username := nullif(btrim(new.raw_user_meta_data ->> 'username'), '');
  if requested_username is null then
    raise exception 'A Scorelytics username is required';
  end if;

  insert into public.profiles (id, username)
  values (new.id, requested_username);
  return new;
end;
$$;

create trigger on_scorelytics_user_created
  after insert on auth.users
  for each row execute procedure public.create_scorelytics_profile();

create table public.test_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject text not null check (char_length(btrim(subject)) between 1 and 120),
  score numeric not null check (score >= 0),
  total numeric not null check (total > 0 and score <= total),
  test_date text not null default to_char(current_date, 'FMMonth FMDD, YYYY'),
  created_at timestamptz not null default now()
);

create index test_results_user_created_at_idx
  on public.test_results (user_id, created_at);

create table public.school_locations (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  region text not null check (char_length(btrim(region)) between 1 and 120),
  school_name text not null check (char_length(btrim(school_name)) between 1 and 200),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  updated_at timestamptz not null default now()
);

create table public.legacy_imports (
  user_id uuid primary key references auth.users (id) on delete cascade,
  legacy_username text not null check (char_length(btrim(legacy_username)) between 1 and 64),
  imported_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.test_results enable row level security;
alter table public.school_locations enable row level security;
alter table public.legacy_imports enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Users can read their own test results"
  on public.test_results for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add their own test results"
  on public.test_results for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own test results"
  on public.test_results for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own test results"
  on public.test_results for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.replace_my_test_results(test_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(jsonb_typeof(test_items), '') <> 'array' then
    raise exception 'Test results must be provided as an array';
  end if;

  delete from public.test_results
  where user_id = (select auth.uid());

  insert into public.test_results (user_id, subject, score, total, test_date)
  select
    (select auth.uid()),
    btrim(item ->> 'subject'),
    (item ->> 'score')::numeric,
    (item ->> 'total')::numeric,
    coalesce(nullif(item ->> 'date', ''), to_char(current_date, 'FMMonth FMDD, YYYY'))
  from jsonb_array_elements(test_items) as results(item);
end;
$$;

create policy "Users can read their own school location"
  on public.school_locations for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add their own school location"
  on public.school_locations for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own school location"
  on public.school_locations for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own school location"
  on public.school_locations for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can read their own legacy import status"
  on public.legacy_imports for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.import_my_legacy_data(
  p_legacy_username text,
  p_tests jsonb,
  p_location jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  item jsonb;
begin
  if current_user_id is null then
    raise exception 'Sign-in is required to import records';
  end if;
  if char_length(btrim(coalesce(p_legacy_username, ''))) not between 1 and 64 then
    raise exception 'A valid legacy username is required';
  end if;
  if coalesce(jsonb_typeof(p_tests), '') <> 'array' or jsonb_array_length(p_tests) > 2000 then
    raise exception 'Legacy test records must be an array of at most 2000 records';
  end if;
  if exists (
    select 1 from public.legacy_imports
    where user_id = current_user_id
  ) then
    raise exception 'Legacy records have already been imported for this account';
  end if;

  for item in select value from jsonb_array_elements(p_tests)
  loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'A legacy test record is invalid';
    end if;

    insert into public.test_results (user_id, subject, score, total, test_date)
    values (
      current_user_id,
      btrim(item ->> 'subject'),
      (item ->> 'score')::numeric,
      (item ->> 'total')::numeric,
      coalesce(nullif(item ->> 'date', ''), to_char(current_date, 'FMMonth FMDD, YYYY'))
    );
  end loop;

  if p_location is not null and p_location <> 'null'::jsonb then
    if jsonb_typeof(p_location) <> 'object' then
      raise exception 'The legacy school location is invalid';
    end if;

    insert into public.school_locations (
      user_id,
      region,
      school_name,
      latitude,
      longitude
    )
    values (
      current_user_id,
      btrim(p_location ->> 'region'),
      btrim(p_location ->> 'school_name'),
      (p_location ->> 'latitude')::double precision,
      (p_location ->> 'longitude')::double precision
    )
    on conflict (user_id) do update set
      region = excluded.region,
      school_name = excluded.school_name,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      updated_at = now();
  end if;

  insert into public.legacy_imports (user_id, legacy_username)
  values (current_user_id, btrim(p_legacy_username));
end;
$$;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.test_results to authenticated;
grant select, insert, update, delete on public.school_locations to authenticated;
grant select on public.legacy_imports to authenticated;
grant execute on function public.replace_my_test_results(jsonb) to authenticated;
grant execute on function public.import_my_legacy_data(text, jsonb, jsonb) to authenticated;
