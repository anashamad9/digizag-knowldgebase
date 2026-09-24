-- Paste this entire file into the Supabase SQL Editor and run as postgres.
-- Safe to rerun for this application schema. Does not create user accounts.
begin;
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
create table if not exists public.workspaces(id uuid primary key default gen_random_uuid(), name text not null);
create table if not exists public.members(user_id uuid primary key references auth.users on delete cascade, workspace_id uuid not null references public.workspaces on delete cascade);
create table if not exists public.conversations(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces, owner_id uuid not null references auth.users, title text not null, updated_at timestamptz not null default now());
create table if not exists public.messages(id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations on delete cascade, role text not null check(role in ('user','assistant')), content text not null, source_ids uuid[] not null default '{}', saved boolean not null default false, created_at timestamptz not null default now());
create table if not exists public.connections(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces, owner_id uuid not null references auth.users on delete cascade, provider text not null check(provider in ('gmail','pumble')), composio_id text not null unique, status text not null default 'ACTIVE', visibility text not null default 'private' check(visibility in ('private','workspace')), cursor jsonb not null default '{}', last_synced_at timestamptz, error text, locked_until timestamptz, unique(owner_id,provider));
create table if not exists public.memories(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces, owner_id uuid not null references auth.users on delete cascade, connection_id uuid references public.connections on delete cascade, external_id text, title text not null, content text not null, source text not null check(source in ('note','gmail','pumble','file')), visibility text not null default 'private' check(visibility in ('private','workspace')), metadata jsonb not null default '{}', content_hash text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(connection_id,external_id));
create table if not exists public.chunks(id uuid primary key default gen_random_uuid(), memory_id uuid not null references public.memories on delete cascade, content text not null, position int not null, embedding extensions.vector(1536) not null, search_vector tsvector generated always as (to_tsvector('simple',content)) stored);
create index if not exists chunks_embedding_idx on public.chunks using hnsw(embedding extensions.vector_cosine_ops);
create index if not exists chunks_search_idx on public.chunks using gin(search_vector);
create index if not exists memories_owner_idx on public.memories(owner_id,workspace_id);
create index if not exists messages_conversation_idx on public.messages(conversation_id,created_at);
create index if not exists chunks_memory_idx on public.chunks(memory_id);
create table if not exists public.request_limits(user_id uuid not null references auth.users on delete cascade, bucket bigint not null, count int not null default 1, primary key(user_id,bucket));
alter table public.workspaces enable row level security;
alter table public.members enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.connections enable row level security;
alter table public.memories enable row level security;
alter table public.chunks enable row level security;
alter table public.request_limits enable row level security;
drop policy if exists member_self on public.members;
create policy member_self on public.members for select to authenticated using(user_id=auth.uid());
drop policy if exists workspace_member on public.workspaces;
create policy workspace_member on public.workspaces for select to authenticated using(exists(select 1 from public.members where user_id=auth.uid() and workspace_id=workspaces.id));
drop policy if exists conversation_owner on public.conversations;
create policy conversation_owner on public.conversations for all to authenticated using(owner_id=auth.uid() and workspace_id=(select workspace_id from public.members where user_id=auth.uid())) with check(owner_id=auth.uid() and workspace_id=(select workspace_id from public.members where user_id=auth.uid()));
drop policy if exists message_owner on public.messages;
create policy message_owner on public.messages for all to authenticated using(exists(select 1 from public.conversations c where c.id=conversation_id and c.owner_id=auth.uid())) with check(exists(select 1 from public.conversations c where c.id=conversation_id and c.owner_id=auth.uid()));
drop policy if exists connection_read on public.connections;
create policy connection_read on public.connections for select to authenticated using(owner_id=auth.uid() and workspace_id=(select workspace_id from public.members where user_id=auth.uid()));
drop policy if exists memory_read on public.memories;
create policy memory_read on public.memories for select to authenticated using(workspace_id=(select workspace_id from public.members where user_id=auth.uid()) and (owner_id=auth.uid() or visibility='workspace'));
drop policy if exists memory_insert on public.memories;
create policy memory_insert on public.memories for insert to authenticated with check(owner_id=auth.uid() and workspace_id=(select workspace_id from public.members where user_id=auth.uid()) and connection_id is null);
drop policy if exists memory_update on public.memories;
create policy memory_update on public.memories for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid() and workspace_id=(select workspace_id from public.members where user_id=auth.uid()));
drop policy if exists memory_delete on public.memories;
create policy memory_delete on public.memories for delete to authenticated using(owner_id=auth.uid());
drop policy if exists chunk_read on public.chunks;
create policy chunk_read on public.chunks for select to authenticated using(exists(select 1 from public.memories m where m.id=memory_id));
drop policy if exists chunk_insert on public.chunks;
create policy chunk_insert on public.chunks for insert to authenticated with check(exists(select 1 from public.memories m where m.id=memory_id and m.owner_id=auth.uid()));
drop policy if exists chunk_delete on public.chunks;
create policy chunk_delete on public.chunks for delete to authenticated using(exists(select 1 from public.memories m where m.id=memory_id and m.owner_id=auth.uid()));

-- Security invoker: both retrieval branches obey memories/chunks RLS.
create or replace function public.search_memory(query_embedding extensions.vector(1536), query_text text, target_workspace uuid, match_count int default 12)
returns table(id uuid,title text,content text,source text,created_at timestamptz,visibility text,metadata jsonb,score float)
language sql stable security invoker set search_path=public,extensions as $$
 with ranked as (
 select m.id,m.title,c.content,m.source,m.created_at,m.visibility,m.metadata,
 (1-(c.embedding <=> query_embedding)) + least(ts_rank_cd(c.search_vector,websearch_to_tsquery('simple',query_text)),0.5) as score,
 row_number() over(partition by m.id order by (c.embedding <=> query_embedding)-least(ts_rank_cd(c.search_vector,websearch_to_tsquery('simple',query_text)),0.5)) as rn
 from public.chunks c join public.memories m on m.id=c.memory_id where m.workspace_id=target_workspace
 ) select id,title,content,source,created_at,visibility,metadata,score::float from ranked where rn=1 and score>0.18 order by score desc limit least(match_count,20);
$$;

-- Atomic replacement: a failed embedding/index operation never leaves half a memory.
create or replace function public.write_memory(record jsonb, pieces jsonb) returns uuid
language plpgsql security invoker set search_path=public,extensions as $$
declare mid uuid; piece jsonb;
begin
 mid:=coalesce((record->>'id')::uuid,gen_random_uuid());
 insert into public.memories(id,workspace_id,owner_id,connection_id,external_id,title,content,source,visibility,metadata,content_hash)
 values(mid,(record->>'workspace_id')::uuid,(record->>'owner_id')::uuid,(record->>'connection_id')::uuid,record->>'external_id',record->>'title',record->>'content',record->>'source',record->>'visibility',coalesce(record->'metadata','{}'),record->>'content_hash')
 on conflict(id) do update set title=excluded.title,content=excluded.content,visibility=excluded.visibility,metadata=excluded.metadata,content_hash=excluded.content_hash,updated_at=now();
 delete from public.chunks where memory_id=mid;
 for piece in select * from jsonb_array_elements(pieces) loop
 insert into public.chunks(memory_id,content,position,embedding) values(mid,piece->>'content',(piece->>'position')::int,(piece->>'embedding')::extensions.vector);
 end loop;
 return mid;
end;
$$;
create or replace function public.claim_connection(connection_uuid uuid) returns boolean language plpgsql security invoker set search_path=public as $$
begin
 update public.connections set locked_until=now()+interval '5 minutes' where id=connection_uuid and (locked_until is null or locked_until<now());
 return found;
end;
$$;
create or replace function public.consume_request(uid uuid) returns boolean language plpgsql security invoker set search_path=public as $$
declare n int; b bigint:=floor(extract(epoch from now())/60);
begin
 insert into public.request_limits(user_id,bucket,count) values(uid,b,1) on conflict(user_id,bucket) do update set count=request_limits.count+1 returning count into n;
 delete from public.request_limits where bucket<b-10;
 return n<=20;
end;
$$;
revoke all on function public.claim_connection(uuid) from public,anon,authenticated;
revoke all on function public.consume_request(uuid) from public,anon,authenticated;
grant execute on function public.claim_connection(uuid),public.consume_request(uuid) to service_role;
revoke all on function public.search_memory(extensions.vector,text,uuid,int),public.write_memory(jsonb,jsonb) from public,anon;
grant execute on function public.search_memory(extensions.vector,text,uuid,int),public.write_memory(jsonb,jsonb) to authenticated,service_role;
-- Original files are private. Object paths start with the owning auth user ID.
insert into storage.buckets(id,name,public,file_size_limit) values('knowledge','knowledge',false,4000000) on conflict(id) do nothing;
drop policy if exists own_files_read on storage.objects;
create policy own_files_read on storage.objects for select to authenticated using(bucket_id='knowledge' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists own_files_insert on storage.objects;
create policy own_files_insert on storage.objects for insert to authenticated with check(bucket_id='knowledge' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists own_files_delete on storage.objects;
create policy own_files_delete on storage.objects for delete to authenticated using(bucket_id='knowledge' and (storage.foldername(name))[1]=auth.uid()::text);

-- A removed imported item must not reappear on the next sync.
create table if not exists public.ignored_sources(connection_id uuid not null references public.connections on delete cascade, external_id text not null, primary key(connection_id,external_id));
alter table public.ignored_sources enable row level security;
alter table public.connections add column if not exists last_attempt_at timestamptz;
grant usage on schema public,extensions to authenticated,service_role;
grant select on public.workspaces,public.members,public.connections to authenticated;
grant select,insert,update,delete on public.conversations,public.messages,public.memories to authenticated;
grant select,insert,delete on public.chunks to authenticated;
grant all on all tables in schema public to service_role;
alter table public.messages add column if not exists visibility text not null default 'private' check (visibility in ('private','workspace'));

commit;

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

-- Knowledge reliability layer
begin;
-- Rules are explicitly maintained by the workspace owner, never learned from source instructions.
create table if not exists public.knowledge_rules (
 workspace_id uuid primary key references public.workspaces on delete cascade,
 content text not null default '' check(length(content)<=12000),
 updated_at timestamptz not null default now()
);
alter table public.knowledge_rules enable row level security;
drop policy if exists knowledge_rules_read on public.knowledge_rules;
create policy knowledge_rules_read on public.knowledge_rules for select to authenticated using(workspace_id=(select workspace_id from public.members where user_id=auth.uid()));
drop policy if exists knowledge_rules_owner on public.knowledge_rules;
create policy knowledge_rules_owner on public.knowledge_rules for all to authenticated using(exists(select 1 from public.members where user_id=auth.uid() and role='owner' and workspace_id=knowledge_rules.workspace_id)) with check(exists(select 1 from public.members where user_id=auth.uid() and role='owner' and workspace_id=knowledge_rules.workspace_id));
grant select,insert,update on public.knowledge_rules to authenticated;
grant all on public.knowledge_rules to service_role;
alter table public.messages add column if not exists evidence_analysis jsonb;
-- Previous source versions remain private to the source owner, even if its current version is shared.
create table if not exists public.memory_revisions (
 id uuid primary key default gen_random_uuid(), memory_id uuid not null references public.memories on delete cascade,
 title text not null, content text not null, metadata jsonb not null, replaced_at timestamptz not null default now()
);
alter table public.memory_revisions enable row level security;
drop policy if exists revisions_owner on public.memory_revisions;
create policy revisions_owner on public.memory_revisions for select to authenticated using(exists(select 1 from public.memories m where m.id=memory_id and m.owner_id=auth.uid()));
grant select on public.memory_revisions to authenticated;
grant all on public.memory_revisions to service_role;
create or replace function public.record_memory_revision() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if old.content is distinct from new.content or old.title is distinct from new.title then
 insert into public.memory_revisions(memory_id,title,content,metadata) values(old.id,old.title,old.content,old.metadata);
 end if;
 return new;
end $$;
revoke all on function public.record_memory_revision() from public,anon,authenticated;
drop trigger if exists memory_revision on public.memories;
create trigger memory_revision before update on public.memories for each row execute function public.record_memory_revision();
-- A bad or missing provider date must never break retrieval or become an ingestion-date claim.
create or replace function public.memory_source_time(meta jsonb) returns timestamptz language plpgsql stable as $$
declare value text;
begin
 value:=coalesce(meta->>'received_at',meta->>'reported_at',meta->>'datetime',meta->>'date');
 if value ~ '^\d{13}$' then return to_timestamp(value::double precision/1000); end if;
 if value ~ '^\d{10}$' then return to_timestamp(value::double precision); end if;
 return value::timestamptz;
exception when others then return null;
end $$;
-- Combine semantic relevance with exact identifier/keyword matches and chronological coverage.
create or replace function public.search_memory_v2(query_embedding extensions.vector(1536),query_text text,target_workspace uuid,identifiers text[] default '{}')
returns table(id uuid,title text,content text,source text,created_at timestamptz,visibility text,metadata jsonb,score float)
language sql stable security invoker set search_path=public,extensions as $$
 with candidates as (
 select m.id,m.title,c.content,m.source,m.created_at,m.visibility,m.metadata,
 1-(c.embedding <=> query_embedding) as semantic,
 ts_rank_cd(c.search_vector,websearch_to_tsquery('simple',query_text)) as lexical,
 (cardinality(identifiers)>0 and regexp_split_to_array(lower(c.content),'[^[:alnum:]_-]+') && identifiers) as exact,
 public.memory_source_time(m.metadata) as source_time,
 row_number() over(partition by m.id order by
 (cardinality(identifiers)>0 and regexp_split_to_array(lower(c.content),'[^[:alnum:]_-]+') && identifiers) desc,
 (c.embedding <=> query_embedding)-least(ts_rank_cd(c.search_vector,websearch_to_tsquery('simple',query_text)),0.5)) as rn
 from public.chunks c join public.memories m on m.id=c.memory_id
 where m.workspace_id=target_workspace and coalesce(m.metadata->>'generated','false') <> 'true'
 ), unique_sources as (select * from candidates where rn=1),
 relevant as (select id from unique_sources where semantic>0.18 or lexical>0 or exact order by exact desc,semantic+least(lexical,0.5) desc limit 12),
 recent as (select id from unique_sources where exact or lexical>0 order by source_time desc nulls last limit 12),
 earliest as (select id from unique_sources where exact order by source_time asc nulls last limit 4)
 select u.id,u.title,u.content,u.source,u.created_at,u.visibility,u.metadata,(u.semantic+least(u.lexical,0.5))::float
 from unique_sources u where u.id in(select id from relevant union select id from recent union select id from earliest)
 order by u.exact desc,u.source_time desc nulls last,u.semantic desc;
$$;
revoke all on function public.search_memory_v2(extensions.vector,text,uuid,text[]) from public,anon;
grant execute on function public.search_memory_v2(extensions.vector,text,uuid,text[]) to authenticated,service_role;
notify pgrst,'reload schema';
commit;

-- Sent-date ordering
begin;
-- Parse old numeric provider timestamps and RFC/ISO email dates safely.
create or replace function public.parse_message_date(value text) returns timestamptz
language plpgsql stable set search_path=public as $$
begin
 if value is null or btrim(value)='' then return null; end if;
 if value ~ '^\d{13}$' then return to_timestamp(value::double precision/1000); end if;
 if value ~ '^\d{10}(\.\d+)?$' then return to_timestamp(value::double precision); end if;
 if value !~ '[a-zA-Z:/-]' then return null; end if;
 return value::timestamptz;
exception when others then return null;
end $$;
-- Sort BEFORE limiting, so late imports of old mail cannot hide newer messages.
-- RLS still runs as the signed-in caller. Missing sent dates sort last.
create or replace function public.list_memories_by_date()
returns setof public.memories language sql stable security invoker set search_path=public as $$
 select m.* from public.memories m
 order by case m.source
 when 'gmail' then coalesce(public.parse_message_date(m.metadata->>'date'),public.parse_message_date(m.metadata->>'received_at'))
 when 'pumble' then public.parse_message_date(m.metadata->>'datetime')
 else m.created_at end desc nulls last, m.id asc
 limit 500;
$$;
revoke all on function public.list_memories_by_date() from public,anon;
grant execute on function public.list_memories_by_date() to authenticated,service_role;
notify pgrst,'reload schema';
commit;

-- Shared workspace task management
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
