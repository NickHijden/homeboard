-- HOMEBOARD DEVELOPMENT ONLY: axfxuqihsscjekicbgkk
-- Prepared upgrade; apply before publishing the new interface.
-- Existing households receive one six-month transition period.
begin;
do $$ begin
  if to_regprocedure('public.require_active_homeboard_account()') is null or to_regprocedure('public.create_household(text)') is null then
    raise exception 'Install the existing household and account-data setup first';
  end if;
end $$;

-- invitation-management-setup.sql
-- Homeboard Development: renewable invitation links and current-owner revocation.
-- Run AFTER household-invitations-setup.sql and account-data-setup.sql.
-- Installing this migration does not change existing invitations or planner data.

do $$ begin
  if to_regprocedure('public.require_active_homeboard_account()') is null then
    raise exception 'Install account-data-setup.sql before invitation-management-setup.sql';
  end if;
end $$;

-- Internal helper only. Serialize owner actions with deletion and recheck the
-- owner's locked membership, including a concurrent ownership transfer.
create or replace function public.require_invitation_household_owner(target_household_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  caller_id uuid := public.require_active_homeboard_account();
  caller_household_role text;
begin
  -- NO KEY UPDATE is compatible with the FK lock taken by a joining member.
  perform h.id from public.households h where h.id = target_household_id for no key update;
  select m.role into caller_household_role from public.household_members m
    where m.household_id = target_household_id and m.user_id = caller_id for update;
  if caller_household_role is distinct from 'owner' then
    raise exception 'Only the current household owner can manage this invitation';
  end if;
  return caller_id;
end;
$$;
revoke all on function public.require_invitation_household_owner(uuid) from public, anon, authenticated;

create or replace function public.renew_household_invitation(target_invitation_id uuid)
returns table (invitation_id uuid, invited_email text, expires_at timestamptz, token text)
language plpgsql security definer set search_path = ''
as $$
declare
  target_household uuid;
  caller_id uuid;
  invitation public.household_invitations%rowtype;
  new_token text;
  new_expiry timestamptz;
begin
  select i.household_id into target_household from public.household_invitations i where i.id = target_invitation_id;
  caller_id := public.require_invitation_household_owner(target_household);
  select i.* into invitation from public.household_invitations i where i.id = target_invitation_id for update;
  if not found then raise exception 'This invitation is no longer available'; end if;
  if invitation.accepted_at is not null then raise exception 'This invitation has already been accepted'; end if;
  if invitation.revoked_at is not null then raise exception 'This invitation was revoked. Create a new invitation instead'; end if;
  if exists (select 1 from public.household_members m join auth.users u on u.id = m.user_id
    where m.household_id = target_household and lower(btrim(u.email)) = lower(btrim(invitation.invited_email))) then
    raise exception 'This person is already a household member';
  end if;
  new_token := encode(extensions.gen_random_bytes(32), 'hex');
  new_expiry := now() + interval '7 days';
  update public.household_invitations i
    set token_hash = encode(extensions.digest(new_token, 'sha256'), 'hex'), expires_at = new_expiry, invited_by = caller_id
    where i.id = target_invitation_id;
  return query select invitation.id, invitation.invited_email, new_expiry, new_token;
end;
$$;

create or replace function public.revoke_household_invitation(target_invitation_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  target_household uuid;
  invitation public.household_invitations%rowtype;
begin
  select i.household_id into target_household from public.household_invitations i where i.id = target_invitation_id;
  perform public.require_invitation_household_owner(target_household);
  select i.* into invitation from public.household_invitations i where i.id = target_invitation_id for update;
  if not found then raise exception 'This invitation is no longer available'; end if;
  if invitation.accepted_at is not null then raise exception 'This invitation has already been accepted'; end if;
  update public.household_invitations i set revoked_at = coalesce(i.revoked_at, now()) where i.id = target_invitation_id;
  return true;
end;
$$;

revoke all on function public.renew_household_invitation(uuid) from public, anon, authenticated;
revoke all on function public.revoke_household_invitation(uuid) from public, anon, authenticated;
grant execute on function public.renew_household_invitation(uuid) to authenticated;
grant execute on function public.revoke_household_invitation(uuid) to authenticated;
notify pgrst, 'reload schema';

-- customer-access-setup.sql
-- Development: six-month household access. Existing households receive a
-- six-month transition period; new households activate a pass first.

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

-- household-email-setup.sql
-- Development: short invitation codes and bounded, authenticated email requests.

alter table public.household_invitations add column if not exists short_code_hash text;
create unique index if not exists household_invitation_short_codes on public.household_invitations(short_code_hash) where short_code_hash is not null;
create table if not exists public.homeboard_email_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  household_id uuid not null references public.households on delete cascade,
  request_key text not null,
  operation text not null,
  status text not null default 'reserved' check(status in ('reserved','sent','failed','unknown')),
  created_at timestamptz not null default now(),
  unique(user_id,request_key)
);
alter table public.homeboard_email_requests enable row level security;
revoke all on public.homeboard_email_requests from anon,authenticated;

create or replace function public.prepare_household_email(target_household_id uuid, email_operation text, request_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid := public.require_active_homeboard_account(); operation_id uuid; recipients jsonb;
begin
  if email_operation not in ('invite','renew','notify','claim-pass','approve-pass','request-renewal') or char_length(request_key) not between 8 and 128 then raise exception 'Invalid email request'; end if;
  if email_operation='approve-pass' then
    if not public.is_platform_admin() then raise exception 'Platform administrator access is required'; end if;
  elsif email_operation in ('invite','renew','claim-pass','request-renewal') then
    perform public.require_invitation_household_owner(target_household_id);
  elsif not public.is_household_member(target_household_id) then raise exception 'Household membership is required';
  end if;
  -- Lock one stable actor row to serialize quota checks across households.
  perform u.id from auth.users u where u.id=caller for update;
  if exists(select 1 from public.homeboard_email_requests r where r.user_id=caller and r.request_key=prepare_household_email.request_key) then return jsonb_build_object('duplicate',true); end if;
  if (select count(*) from public.homeboard_email_requests r where r.user_id=caller and r.created_at>now()-interval '1 minute')>=5
    or (select count(*) from public.homeboard_email_requests r where r.user_id=caller and r.created_at>now()-interval '1 hour')>=40 then raise exception 'Too many email requests. Please try again later'; end if;
  insert into public.homeboard_email_requests(user_id,household_id,request_key,operation) values(caller,target_household_id,request_key,email_operation) returning id into operation_id;
  select coalesce(jsonb_agg(u.email),'[]'::jsonb) into recipients from public.household_members m join auth.users u on u.id=m.user_id
    where m.household_id=target_household_id and m.user_id<>caller and u.email_confirmed_at is not null;
  return jsonb_build_object('request_id',operation_id,'recipients',recipients);
end $$;

create or replace function public.create_email_invitation(target_household_id uuid,target_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare invitation record; code text := upper(encode(extensions.gen_random_bytes(8),'hex'));
begin
  perform public.require_invitation_household_owner(target_household_id);
  if target_email is null or target_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or char_length(target_email)>320 then raise exception 'Enter a valid email address'; end if;
  select * into invitation from public.create_household_invitation(target_household_id,target_email,168);
  update public.household_invitations set short_code_hash=encode(extensions.digest(code,'sha256'),'hex') where id=invitation.invitation_id;
  return to_jsonb(invitation)||jsonb_build_object('code',code);
end $$;
create or replace function public.renew_email_invitation(target_household_id uuid,target_invitation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare invitation record; code text := upper(encode(extensions.gen_random_bytes(8),'hex'));
begin
  if not exists(select 1 from public.household_invitations i where i.id=target_invitation_id and i.household_id=target_household_id) then raise exception 'Invitation is not in this household'; end if;
  select * into invitation from public.renew_household_invitation(target_invitation_id);
  update public.household_invitations set short_code_hash=encode(extensions.digest(code,'sha256'),'hex') where id=invitation.invitation_id;
  return to_jsonb(invitation)||jsonb_build_object('code',code);
end $$;
-- Renewing through the legacy link endpoint must also invalidate any old code.
create or replace function public.invalidate_old_invitation_code() returns trigger language plpgsql set search_path='' as $$ begin
  if new.token_hash is distinct from old.token_hash then new.short_code_hash=null; end if; return new;
end $$;
drop trigger if exists invalidate_old_invitation_code on public.household_invitations;
create trigger invalidate_old_invitation_code before update on public.household_invitations for each row execute function public.invalidate_old_invitation_code();
revoke all on function public.invalidate_old_invitation_code() from public,anon,authenticated;

create or replace function public.accept_household_code(invitation_code text)
returns table(household_id uuid, household_name text)
language plpgsql security definer set search_path='' as $$
declare caller uuid := public.require_active_homeboard_account(); recipient text; invitation public.household_invitations%rowtype;
begin
  select lower(btrim(u.email)) into recipient from auth.users u where u.id=caller and u.email_confirmed_at is not null;
  if recipient is null then raise exception 'Confirm your Homeboard email before accepting an invitation'; end if;
  select i.* into invitation from public.household_invitations i
    where i.short_code_hash=encode(extensions.digest(upper(regexp_replace(invitation_code,'[ -]','','g')),'sha256'),'hex')
      and i.accepted_at is null and i.revoked_at is null and i.expires_at>now() for update;
  if not found or lower(btrim(invitation.invited_email))<>recipient then raise exception 'This invitation code is invalid, expired or unavailable for your email'; end if;
  insert into public.household_members(household_id,user_id,role) values(invitation.household_id,caller,'member') on conflict on constraint household_members_pkey do nothing;
  update public.household_invitations set accepted_at=now(),accepted_by=caller where id=invitation.id;
  return query select h.id,h.name from public.households h where h.id=invitation.household_id;
end $$;

revoke all on function public.prepare_household_email(uuid,text,text),public.create_email_invitation(uuid,text),public.renew_email_invitation(uuid,uuid),public.accept_household_code(text) from public,anon,authenticated;
grant execute on function public.prepare_household_email(uuid,text,text),public.create_email_invitation(uuid,text),public.renew_email_invitation(uuid,uuid),public.accept_household_code(text) to authenticated;
grant select,update on public.homeboard_email_requests to service_role;
notify pgrst,'reload schema';

-- access-data-setup.sql
-- Apply after customer-access-setup.sql and household-email-setup.sql.

-- Export access and delivery records without activation codes or token hashes.
create or replace function public.export_my_access_records() returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=public.require_active_homeboard_account(); caller_email text;
begin
  select lower(btrim(u.email)) into caller_email from auth.users u where u.id=caller;
  return jsonb_build_object(
    'household_access',coalesce((select jsonb_agg(to_jsonb(a)) from public.household_access a join public.household_members m on m.household_id=a.household_id where m.user_id=caller),'[]'::jsonb),
    'passes',coalesce((select jsonb_agg(to_jsonb(p)-'token_hash') from public.household_access_passes p where p.recipient_user_id=caller or p.email=caller_email),'[]'::jsonb),
    'email_requests',coalesce((select jsonb_agg(to_jsonb(r)-'request_key') from public.homeboard_email_requests r where r.user_id=caller),'[]'::jsonb)
  );
end $$;
revoke all on function public.export_my_access_records() from public,anon,authenticated;
grant execute on function public.export_my_access_records() to authenticated;

create or replace function public.list_platform_household_access() returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=public.require_active_homeboard_account(); result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator access is required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('household_id',a.household_id,'expires_at',a.expires_at,
    'renewal_requested',exists(select 1 from public.homeboard_email_requests r where r.household_id=a.household_id and r.operation='request-renewal'
      and r.created_at>coalesce((select max(p.created_at) from public.household_access_passes p where p.household_id=a.household_id and p.source='approved'),'-infinity'::timestamptz)))),'[]'::jsonb)
    into result from public.household_access a;
  return result;
end $$;
revoke all on function public.list_platform_household_access() from public,anon,authenticated;
grant execute on function public.list_platform_household_access() to authenticated;

create or replace function public.clean_up_deleted_homeboard_passes() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  delete from public.household_access_passes p where p.recipient_user_id=old.id or p.email=lower(btrim(old.email));
  return old;
end $$;
drop trigger if exists clean_up_deleted_homeboard_passes on auth.users;
create trigger clean_up_deleted_homeboard_passes before delete on auth.users for each row execute function public.clean_up_deleted_homeboard_passes();
revoke all on function public.clean_up_deleted_homeboard_passes() from public,anon,authenticated;
notify pgrst,'reload schema';

commit;
