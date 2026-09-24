begin;
alter table public.members add column if not exists role text not null default 'member' check(role in ('owner','member'));
alter table public.members add column if not exists disabled boolean not null default false;
drop policy if exists member_self on public.members;
create policy member_self on public.members for select to authenticated using(user_id=auth.uid() and not disabled);
alter table public.memories add column if not exists conversation_id uuid references public.conversations(id) on delete cascade;
update public.memories m set conversation_id=c.id from public.conversations c where m.metadata->>'conversation_id'=c.id::text and m.owner_id=c.owner_id and m.workspace_id=c.workspace_id and m.conversation_id is null;
create index if not exists memories_conversation_idx on public.memories(conversation_id);
-- Validate ownership even when write_memory is called directly.
create or replace function public.validate_memory_conversation() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.conversation_id is not null and not exists(select 1 from public.conversations where id=new.conversation_id and owner_id=new.owner_id and workspace_id=new.workspace_id) then
 raise exception 'Conversation does not belong to memory owner';
 end if;
 return new;
end $$;
drop trigger if exists memory_conversation_owner on public.memories;
create trigger memory_conversation_owner before insert or update on public.memories for each row execute function public.validate_memory_conversation();
-- Queue original-file cleanup atomically with all memory deletions, including cascades.
create table if not exists public.storage_deletions(path text primary key, owner_id uuid not null, created_at timestamptz not null default now());
alter table public.storage_deletions enable row level security;
revoke all on public.storage_deletions from anon,authenticated;
grant all on public.storage_deletions to service_role;
create or replace function public.queue_memory_file_deletion() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if old.metadata->>'storage_path' like old.owner_id::text || '/%' then
 insert into public.storage_deletions(path,owner_id) values(old.metadata->>'storage_path',old.owner_id) on conflict do nothing;
 end if;
 return old;
end $$;
revoke all on function public.queue_memory_file_deletion() from public,anon,authenticated;
drop trigger if exists memory_file_cleanup on public.memories;
create trigger memory_file_cleanup after delete on public.memories for each row execute function public.queue_memory_file_deletion();
-- Revoked accounts cannot use an existing session to mutate memory.
drop policy if exists memory_delete on public.memories;
create policy memory_delete on public.memories for delete to authenticated using(owner_id=auth.uid() and workspace_id=(select workspace_id from public.members where user_id=auth.uid()));
create or replace function public.write_memory(record jsonb, pieces jsonb) returns uuid
language plpgsql security invoker set search_path=public,extensions as $$
declare mid uuid; piece jsonb;
begin
 mid:=coalesce((record->>'id')::uuid,gen_random_uuid());
 insert into public.memories(id,workspace_id,owner_id,connection_id,external_id,title,content,source,visibility,metadata,content_hash,conversation_id)
 values(mid,(record->>'workspace_id')::uuid,(record->>'owner_id')::uuid,(record->>'connection_id')::uuid,record->>'external_id',record->>'title',record->>'content',record->>'source',record->>'visibility',coalesce(record->'metadata','{}'),record->>'content_hash',nullif(record->'metadata'->>'conversation_id','')::uuid)
 on conflict(id) do update set title=excluded.title,content=excluded.content,visibility=excluded.visibility,metadata=excluded.metadata,content_hash=excluded.content_hash,updated_at=now();
 delete from public.chunks where memory_id=mid;
 for piece in select * from jsonb_array_elements(pieces) loop
 insert into public.chunks(memory_id,content,position,embedding) values(mid,piece->>'content',(piece->>'position')::int,(piece->>'embedding')::extensions.vector);
 end loop;
 return mid;
end;
$$;

-- Existing access tokens from suspended accounts must not access originals directly.
drop policy if exists own_files_read on storage.objects;
create policy own_files_read on storage.objects for select to authenticated using(bucket_id='knowledge' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.members where user_id=auth.uid()));
drop policy if exists own_files_insert on storage.objects;
create policy own_files_insert on storage.objects for insert to authenticated with check(bucket_id='knowledge' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.members where user_id=auth.uid()));
drop policy if exists own_files_delete on storage.objects;
create policy own_files_delete on storage.objects for delete to authenticated using(bucket_id='knowledge' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.members where user_id=auth.uid()));
notify pgrst, 'reload schema';
commit;
