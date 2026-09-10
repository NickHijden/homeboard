-- Homeboard cloud sync setup
-- Run this once in Supabase: SQL Editor -> New query -> Run.
-- Both devices then sign in with the same Homeboard account.

create table if not exists public.planner_documents (
  id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.planner_documents enable row level security;

drop policy if exists "Users can read their own Homeboard" on public.planner_documents;
create policy "Users can read their own Homeboard"
  on public.planner_documents for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users can create their own Homeboard" on public.planner_documents;
create policy "Users can create their own Homeboard"
  on public.planner_documents for insert
  to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "Users can update their own Homeboard" on public.planner_documents;
create policy "Users can update their own Homeboard"
  on public.planner_documents for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

grant select, insert, update on public.planner_documents to authenticated;
