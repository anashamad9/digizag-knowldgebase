-- Run after 003_management.sql. Assigns the requested owner account.
do $$
begin
 update public.members set role='owner',disabled=false where user_id=(select id from auth.users where lower(email)='anas.hamad@digizag.com');
 if not found then raise exception 'Add anas.hamad@digizag.com to members first'; end if;
end $$;
