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
