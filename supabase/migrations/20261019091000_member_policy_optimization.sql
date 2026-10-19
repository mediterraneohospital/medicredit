begin;

drop policy if exists mc_member_self on public.mc_members;
drop policy if exists mc_members_admin_select on public.mc_members;
create policy mc_members_select on public.mc_members for select to authenticated
 using (user_id=(select auth.uid()) or (select private.mc_is_admin()));

create index if not exists mc_members_approved_by_idx on public.mc_members(approved_by);

commit;

