alter table public.messages add column if not exists visibility text not null default 'private' check (visibility in ('private','workspace'));
