create extension if not exists vector with schema extensions;
create table public.workspaces(id uuid primary key default gen_random_uuid(), name text not null);
create table public.members(user_id uuid primary key references auth.users on delete cascade, workspace_id uuid not null references public.workspaces on delete cascade);
create table public.conversations(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces, owner_id uuid not null references auth.users, title text not null, updated_at timestamptz not null default now());
create table public.messages(id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations on delete cascade, role text not null check(role in ('user','assistant')), content text not null, source_ids uuid[] not null default '{}', saved boolean not null default false, created_at timestamptz not null default now());
create table public.connections(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces, owner_id uuid not null references auth.users on delete cascade, provider text not null check(provider in ('gmail','pumble')), composio_id text not null unique, status text not null default 'ACTIVE', visibility text not null default 'private' check(visibility in ('private','workspace')), cursor jsonb not null default '{}', last_synced_at timestamptz, error text, locked_until timestamptz, unique(owner_id,provider));
create table public.memories(id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces, owner_id uuid not null references auth.users on delete cascade, connection_id uuid references public.connections on delete cascade, external_id text, title text not null, content text not null, source text not null check(source in ('note','gmail','pumble','file')), visibility text not null default 'private' check(visibility in ('private','workspace')), metadata jsonb not null default '{}', content_hash text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(connection_id,external_id));
create table public.chunks(id uuid primary key default gen_random_uuid(), memory_id uuid not null references public.memories on delete cascade, content text not null, position int not null, embedding extensions.vector(1536) not null, search_vector tsvector generated always as (to_tsvector('simple',content)) stored);
create index chunks_embedding_idx on public.chunks using hnsw(embedding extensions.vector_cosine_ops);
create index chunks_search_idx on public.chunks using gin(search_vector);
create index memories_owner_idx on public.memories(owner_id,workspace_id);
create index messages_conversation_idx on public.messages(conversation_id,created_at);
create index chunks_memory_idx on public.chunks(memory_id);
create table public.request_limits(user_id uuid not null references auth.users on delete cascade, bucket bigint not null, count int not null default 1, primary key(user_id,bucket));
alter table public.workspaces enable row level security;
alter table public.members enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.connections enable row level security;
alter table public.memories enable row level security;
alter table public.chunks enable row level security;
alter table public.request_limits enable row level security;
create policy member_self on public.members for select to authenticated using(user_id=auth.uid());
create policy workspace_member on public.workspaces for select to authenticated using(exists(select 1 from public.members where user_id=auth.uid() and workspace_id=workspaces.id));
create policy conversation_owner on public.conversations for all to authenticated using(owner_id=auth.uid() and workspace_id=(select workspace_id from public.members where user_id=auth.uid())) with check(owner_id=auth.uid() and workspace_id=(select workspace_id from public.members where user_id=auth.uid()));
create policy message_owner on public.messages for all to authenticated using(exists(select 1 from public.conversations c where c.id=conversation_id and c.owner_id=auth.uid())) with check(exists(select 1 from public.conversations c where c.id=conversation_id and c.owner_id=auth.uid()));
create policy connection_read on public.connections for select to authenticated using(owner_id=auth.uid() and workspace_id=(select workspace_id from public.members where user_id=auth.uid()));
create policy memory_read on public.memories for select to authenticated using(workspace_id=(select workspace_id from public.members where user_id=auth.uid()) and (owner_id=auth.uid() or visibility='workspace'));
create policy memory_insert on public.memories for insert to authenticated with check(owner_id=auth.uid() and workspace_id=(select workspace_id from public.members where user_id=auth.uid()) and connection_id is null);
create policy memory_update on public.memories for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid() and workspace_id=(select workspace_id from public.members where user_id=auth.uid()));
create policy memory_delete on public.memories for delete to authenticated using(owner_id=auth.uid());
create policy chunk_read on public.chunks for select to authenticated using(exists(select 1 from public.memories m where m.id=memory_id));
create policy chunk_insert on public.chunks for insert to authenticated with check(exists(select 1 from public.memories m where m.id=memory_id and m.owner_id=auth.uid()));
create policy chunk_delete on public.chunks for delete to authenticated using(exists(select 1 from public.memories m where m.id=memory_id and m.owner_id=auth.uid()));

-- Security invoker: both retrieval branches obey memories/chunks RLS.
create function public.search_memory(query_embedding extensions.vector(1536), query_text text, target_workspace uuid, match_count int default 12)
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
create function public.write_memory(record jsonb, pieces jsonb) returns uuid
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
create function public.claim_connection(connection_uuid uuid) returns boolean language plpgsql security invoker set search_path=public as $$
begin
 update public.connections set locked_until=now()+interval '5 minutes' where id=connection_uuid and (locked_until is null or locked_until<now());
 return found;
end;
$$;
create function public.consume_request(uid uuid) returns boolean language plpgsql security invoker set search_path=public as $$
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
create policy own_files_read on storage.objects for select to authenticated using(bucket_id='knowledge' and (storage.foldername(name))[1]=auth.uid()::text);
create policy own_files_insert on storage.objects for insert to authenticated with check(bucket_id='knowledge' and (storage.foldername(name))[1]=auth.uid()::text);
create policy own_files_delete on storage.objects for delete to authenticated using(bucket_id='knowledge' and (storage.foldername(name))[1]=auth.uid()::text);

-- A removed imported item must not reappear on the next sync.
create table public.ignored_sources(connection_id uuid not null references public.connections on delete cascade, external_id text not null, primary key(connection_id,external_id));
alter table public.ignored_sources enable row level security;
alter table public.connections add column last_attempt_at timestamptz;
grant usage on schema public,extensions to authenticated,service_role;
grant select on public.workspaces,public.members,public.connections to authenticated;
grant select,insert,update,delete on public.conversations,public.messages,public.memories to authenticated;
grant select,insert,delete on public.chunks to authenticated;
grant all on all tables in schema public to service_role;
