-- HabitFlow cloud database
-- Run this entire script in Supabase Dashboard -> SQL Editor.

create table if not exists public.habitflow_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"habits":[],"tasks":[],"checks":{},"taskChecks":{},"checkTimes":{},"taskCheckTimes":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.habitflow_data enable row level security;

revoke all on table public.habitflow_data from anon;
grant select, insert, update, delete on table public.habitflow_data to authenticated;

drop policy if exists "Users can read their own HabitFlow data" on public.habitflow_data;
drop policy if exists "Users can create their own HabitFlow data" on public.habitflow_data;
drop policy if exists "Users can update their own HabitFlow data" on public.habitflow_data;
drop policy if exists "Users can delete their own HabitFlow data" on public.habitflow_data;

create policy "Users can read their own HabitFlow data"
on public.habitflow_data for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own HabitFlow data"
on public.habitflow_data for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own HabitFlow data"
on public.habitflow_data for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own HabitFlow data"
on public.habitflow_data for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists habitflow_data_user_id_idx on public.habitflow_data(user_id);
