-- Shared workspace task management.
begin;
create table if not exists public.tasks (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces on delete cascade,
 creator_id uuid references auth.users on delete set null,
 assignee_id uuid references auth.users on delete set null,
 title text not null check(length(title) between 1 and 160),
 details text not null default '' check(length(details)<=5000),
 priority text not null default 'medium' check(priority in ('low','medium','high','urgent')),
 deadline date,
 status text not null default 'pending' check(status in ('pending','on_it','done','issue')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists tasks_workspace_deadline_idx on public.tasks(workspace_id,deadline);
alter table public.tasks enable row level security;
create or replace function public.is_workspace_member(candidate uuid,target_workspace uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.members where user_id=candidate and workspace_id=target_workspace and not disabled)
$$;
revoke all on function public.is_workspace_member(uuid,uuid) from public,anon;
grant execute on function public.is_workspace_member(uuid,uuid) to authenticated,service_role;
drop policy if exists tasks_workspace_member on public.tasks;
drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select to authenticated
 using(workspace_id=(select workspace_id from public.members where user_id=auth.uid()));
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
 with check(workspace_id=(select workspace_id from public.members where user_id=auth.uid()) and creator_id=auth.uid() and (assignee_id is null or public.is_workspace_member(assignee_id,workspace_id)));
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
 using(workspace_id=(select workspace_id from public.members where user_id=auth.uid()))
 with check(workspace_id=(select workspace_id from public.members where user_id=auth.uid()) and (assignee_id is null or public.is_workspace_member(assignee_id,workspace_id)));
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated
 using(workspace_id=(select workspace_id from public.members where user_id=auth.uid()));
grant select,insert,update,delete on public.tasks to authenticated;
grant all on public.tasks to service_role;
notify pgrst,'reload schema';
commit;
