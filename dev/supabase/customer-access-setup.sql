-- Development: six-month household access. Existing households receive a
-- six-month transition period; new households activate a pass first.
begin;
create table if not exists public.homeboard_access_settings (
  singleton boolean primary key default true check(singleton),
  launch_enabled boolean not null default true,
  duration_months integer not null default 6 check(duration_months between 1 and 24),
  price_cents integer not null default 2000 check(price_cents > 0),
  currency text not null default 'eur' check(currency = 'eur')
);
insert into public.homeboard_access_settings(singleton) values(true) on conflict do nothing;
create table if not exists public.household_access (
  household_id uuid primary key references public.households on delete cascade,
  expires_at timestamptz not null default now(),
  activated_at timestamptz,
  last_pass_requested_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.household_access(household_id,expires_at,activated_at)
  select h.id, now()+interval '6 months', now() from public.households h on conflict do nothing;
create table if not exists public.household_access_passes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  email text not null,
  token_hash text not null unique,
  duration_months integer not null check(duration_months between 1 and 24),
  source text not null check(source in ('launch','approved','paid')),
  payment_reference text unique,
  issued_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  redeem_before timestamptz not null default now()+interval '30 days',
  redeemed_at timestamptz
);
alter table public.household_access_passes add column if not exists recipient_user_id uuid references auth.users on delete cascade;
update public.household_access_passes p set recipient_user_id=u.id from auth.users u
  where p.recipient_user_id is null and lower(btrim(u.email))=p.email;
alter table public.homeboard_access_settings enable row level security;
alter table public.household_access enable row level security;
alter table public.household_access_passes enable row level security;
revoke all on public.homeboard_access_settings,public.household_access,public.household_access_passes from anon,authenticated;

create or replace function public.initialize_household_access() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  insert into public.household_access(household_id) values(new.id) on conflict do nothing; return new;
end $$;
drop trigger if exists initialize_household_access on public.households;
create trigger initialize_household_access after insert on public.households for each row execute function public.initialize_household_access();
revoke all on function public.initialize_household_access() from public,anon,authenticated;

create or replace function public.get_household_access(target_household_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid := public.require_active_homeboard_account(); result jsonb;
begin
  if not public.is_household_member(target_household_id) then raise exception 'Household membership is required'; end if;
  select jsonb_build_object('expires_at',a.expires_at,'active',a.expires_at>now(),'can_claim_free',a.activated_at is null and s.launch_enabled,'renewal_requires_approval',true)
    into result from public.household_access a cross join public.homeboard_access_settings s where a.household_id=target_household_id;
  return result;
end $$;

create or replace function public.issue_homeboard_pass(target_household_id uuid, recipient_email text, pass_source text, actor_id uuid, payment_ref text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare raw_code text := upper(encode(extensions.gen_random_bytes(16),'hex')); months integer; pass_id uuid; recipient uuid;
begin
  select u.id into recipient from auth.users u where lower(btrim(u.email))=lower(btrim(recipient_email)) and u.email_confirmed_at is not null;
  if recipient is null then raise exception 'A verified recipient account is required'; end if;
  select s.duration_months into months from public.homeboard_access_settings s where s.singleton;
  insert into public.household_access_passes(household_id,email,token_hash,duration_months,source,issued_by,payment_reference,recipient_user_id)
    values(target_household_id,lower(btrim(recipient_email)),encode(extensions.digest(raw_code,'sha256'),'hex'),months,pass_source,actor_id,payment_ref,recipient) returning id into pass_id;
  return jsonb_build_object('pass_id',pass_id,'code',raw_code,'email',lower(btrim(recipient_email)),'duration_months',months);
end $$;
revoke all on function public.issue_homeboard_pass(uuid,text,text,uuid,text) from public,anon,authenticated;

create or replace function public.claim_free_household_pass(target_household_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid := public.require_invitation_household_owner(target_household_id); access_row public.household_access%rowtype; recipient text;
begin
  if not exists(select 1 from public.homeboard_access_settings s where s.singleton and s.launch_enabled) then raise exception 'Free launch passes are not available'; end if;
  select a.* into access_row from public.household_access a where a.household_id=target_household_id for update;
  if access_row.activated_at is not null then raise exception 'Renewal requires approval from the Homeboard operator'; end if;
  if access_row.last_pass_requested_at > now()-interval '1 minute' then raise exception 'Wait one minute before requesting another activation email'; end if;
  select u.email into recipient from auth.users u where u.id=caller and u.email_confirmed_at is not null;
  if recipient is null then raise exception 'Confirm your email first'; end if;
  update public.household_access set last_pass_requested_at=now() where household_id=target_household_id;
  return public.issue_homeboard_pass(target_household_id,recipient,'launch',caller);
end $$;

create or replace function public.approve_household_pass(target_household_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid := public.require_active_homeboard_account(); recipient text;
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator access is required'; end if;
  perform h.id from public.households h where h.id=target_household_id for no key update;
  select u.email into recipient from public.household_members m join auth.users u on u.id=m.user_id
    where m.household_id=target_household_id and m.role='owner' and u.email_confirmed_at is not null;
  if recipient is null then raise exception 'A verified household owner is required'; end if;
  return public.issue_homeboard_pass(target_household_id,recipient,'approved',caller);
end $$;

create or replace function public.redeem_household_pass(target_household_id uuid, activation_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid := public.require_invitation_household_owner(target_household_id); pass public.household_access_passes%rowtype; recipient text; current_access public.household_access%rowtype; result_expiry timestamptz;
begin
  select lower(btrim(u.email)) into recipient from auth.users u where u.id=caller and u.email_confirmed_at is not null;
  select p.* into pass from public.household_access_passes p
    where p.household_id=target_household_id and p.token_hash=encode(extensions.digest(upper(regexp_replace(activation_code,'[ -]','','g')),'sha256'),'hex') for update;
  if not found or pass.recipient_user_id is distinct from caller or pass.email is distinct from recipient or pass.redeemed_at is not null or pass.redeem_before<=now() then raise exception 'This activation code is invalid, expired or already used'; end if;
  select a.* into current_access from public.household_access a where a.household_id=target_household_id for update;
  if pass.source='launch' and current_access.activated_at is not null then raise exception 'Renewal requires approval from the Homeboard operator'; end if;
  result_expiry := greatest(current_access.expires_at,now())+make_interval(months=>pass.duration_months);
  update public.household_access set expires_at=result_expiry,activated_at=coalesce(activated_at,now()),updated_at=now() where household_id=target_household_id;
  update public.household_access_passes set redeemed_at=now() where id=pass.id;
  return jsonb_build_object('expires_at',result_expiry,'active',true);
end $$;

create or replace function public.enforce_household_access() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  -- Operator maintenance remains possible; ordinary API writes are enforced
  -- independently of the device clock or a modified browser client.
  if auth.uid() is not null then
    perform public.require_active_homeboard_account();
    if not public.is_household_member(new.household_id) or not exists(select 1 from public.household_access a where a.household_id=new.household_id and a.expires_at>now()) then
      raise exception 'Household access expired. This board is read-only until renewed';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists enforce_household_access on public.household_documents;
create trigger enforce_household_access before update on public.household_documents for each row execute function public.enforce_household_access();
revoke all on function public.enforce_household_access() from public,anon,authenticated;
revoke all on function public.get_household_access(uuid),public.claim_free_household_pass(uuid),public.approve_household_pass(uuid),public.redeem_household_pass(uuid,text) from public,anon,authenticated;
grant execute on function public.get_household_access(uuid),public.claim_free_household_pass(uuid),public.approve_household_pass(uuid),public.redeem_household_pass(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
