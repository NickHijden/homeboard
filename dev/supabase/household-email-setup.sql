-- Development: short invitation codes and bounded, authenticated email requests.
begin;
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
commit;
