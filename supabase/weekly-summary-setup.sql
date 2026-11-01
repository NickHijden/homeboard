-- Apply separately in Development and Production. No jobs are enabled here.
begin;
create table if not exists public.homeboard_weekly_deliveries (
 household_id uuid references public.households(id) on delete cascade,
 user_id uuid references auth.users(id) on delete cascade,
 week_start date not null,
 status text not null default 'reserved' check(status in ('reserved','accepted','failed','unknown')),
 created_at timestamptz not null default now(),
 primary key(household_id,user_id,week_start)
);
alter table public.homeboard_weekly_deliveries enable row level security;
revoke all on public.homeboard_weekly_deliveries from public,anon,authenticated;
grant select,insert,update,delete on public.homeboard_weekly_deliveries to service_role;

create or replace function public.weekly_summary_batch(after_id uuid default null)
returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',d.household_id,'data',d.data,
  'recipients',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'email',u.email)),'[]'::jsonb)
   from public.household_members m join auth.users u on u.id=m.user_id
   where m.household_id=d.household_id and u.email_confirmed_at is not null and u.email is not null)) order by d.household_id), '[]'::jsonb)
 from (select household_id,data from public.household_documents
       where after_id is null or household_id>after_id order by household_id limit 25) d;
$$;
revoke all on function public.weekly_summary_batch(uuid) from public,anon,authenticated;
grant execute on function public.weekly_summary_batch(uuid) to service_role;
notify pgrst,'reload schema';
commit;
