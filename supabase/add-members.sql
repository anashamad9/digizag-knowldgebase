-- First create/invite each account in Supabase > Authentication > Users.
-- Run as postgres after setup.sql.
-- Reuse the same workspace ID for every member of this team.
begin;
insert into public.workspaces(id, name)
values ('b8a10000-0000-4000-8000-000000000001', 'Brain')
on conflict (id) do nothing;
do $$
declare member_email text; member_id uuid;
begin
  foreach member_email in array array['anas.hamad@digizag.com'] loop
    select id into member_id from auth.users where lower(email) = lower(member_email);
    if member_id is null then
      raise exception 'Create/invite % in Supabase Authentication first.', member_email;
    end if;
    insert into public.members(user_id, workspace_id)
    values (member_id, 'b8a10000-0000-4000-8000-000000000001')
    on conflict (user_id) do nothing;
  end loop;
end $$;
commit;
