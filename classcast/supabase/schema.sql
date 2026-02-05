create extension if not exists "uuid-ossp";

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists workouts (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  blocks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key default uuid_generate_v4(),
  workout_id uuid not null references workouts(id) on delete cascade,
  title text not null,
  display_code text not null unique,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sessions_display_code_idx on sessions(display_code);
create index if not exists sessions_workout_id_idx on sessions(workout_id);

drop trigger if exists workouts_set_updated_at on workouts;
create trigger workouts_set_updated_at
before update on workouts
for each row
execute procedure set_updated_at();

drop trigger if exists sessions_set_updated_at on sessions;
create trigger sessions_set_updated_at
before update on sessions
for each row
execute procedure set_updated_at();

-- Note: Enable Realtime replication for the "sessions" table in the Supabase dashboard.
