-- Supabase schema for optional multi-user cloud sync.
-- This keeps each user's full push-up progress in a single row.

create table if not exists public.pushup_counter_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.pushup_counter_states enable row level security;

drop policy if exists "Users can read own state" on public.pushup_counter_states;
create policy "Users can read own state"
on public.pushup_counter_states
for select
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own state" on public.pushup_counter_states;
create policy "Users can insert own state"
on public.pushup_counter_states
for insert
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own state" on public.pushup_counter_states;
create policy "Users can update own state"
on public.pushup_counter_states
for update
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
