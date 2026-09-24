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
