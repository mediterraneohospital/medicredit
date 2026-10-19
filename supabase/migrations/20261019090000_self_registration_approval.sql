begin;

alter table public.mc_members
 add column email text,
 add column full_name text not null default '',
 add column role text not null default 'member' check (role in ('admin','member')),
 add column approved_at timestamptz,
 add column approved_by uuid references auth.users(id);

update public.mc_members m
set email=u.email,
    role=case when m.active then 'admin' else 'member' end,
    approved_at=case when m.active then coalesce(m.approved_at,m.created_at) else null end,
    approved_by=case when m.active then m.user_id else null end
from auth.users u
where u.id=m.user_id;

alter table public.mc_members alter column email set not null;

create schema if not exists private;
revoke all on schema private from public,anon;
grant usage on schema private to authenticated;

create or replace function private.mc_is_admin() returns boolean
language sql stable security definer set search_path=''
as $$
 select exists(
  select 1 from public.mc_members
  where user_id=(select auth.uid()) and active and role='admin'
 );
$$;
revoke all on function private.mc_is_admin() from public,anon;
grant execute on function private.mc_is_admin() to authenticated;

create or replace function private.mc_handle_new_user() returns trigger
language plpgsql security definer set search_path=''
as $$
begin
 insert into public.mc_members(user_id,email,full_name,active,role)
 values(new.id,new.email,coalesce(trim(new.raw_user_meta_data->>'full_name'),''),false,'member')
 on conflict(user_id) do nothing;
 return new;
end;
$$;
revoke all on function private.mc_handle_new_user() from public,anon,authenticated;

drop trigger if exists mc_auth_user_created on auth.users;
create trigger mc_auth_user_created
 after insert on auth.users
 for each row execute function private.mc_handle_new_user();

create policy mc_members_admin_select on public.mc_members for select to authenticated
 using ((select private.mc_is_admin()));
create policy mc_members_admin_update on public.mc_members for update to authenticated
 using ((select private.mc_is_admin()))
 with check ((select private.mc_is_admin()));
grant select,update on public.mc_members to authenticated;

create or replace function public.mc_set_member_active(p_user_id uuid,p_active boolean)
returns public.mc_members
language plpgsql security invoker set search_path=''
as $$
declare saved public.mc_members;
begin
 if not (select private.mc_is_admin()) then raise exception 'Δεν έχετε δικαίωμα διαχείρισης χρηστών.'; end if;
 if p_user_id=(select auth.uid()) and not p_active then raise exception 'Δεν μπορείτε να απενεργοποιήσετε τον λογαριασμό σας.'; end if;
 update public.mc_members
 set active=p_active,
     approved_at=case when p_active then now() else approved_at end,
     approved_by=case when p_active then (select auth.uid()) else approved_by end
 where user_id=p_user_id
 returning * into saved;
 if not found then raise exception 'Ο χρήστης δεν βρέθηκε.'; end if;
 return saved;
end;
$$;
revoke all on function public.mc_set_member_active(uuid,boolean) from public,anon;
grant execute on function public.mc_set_member_active(uuid,boolean) to authenticated;

commit;

