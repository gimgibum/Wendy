-- 계정 테이블, 로그인 함수 (Supabase SQL Editor에서 실행)
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

alter table public.users enable row level security;
alter table public.sessions enable row level security;
revoke all on table public.users, public.sessions from anon, authenticated;

create or replace function public.sign_up(p_username text, p_password text)
returns table (id uuid, username text)
language sql
security definer
set search_path = public, extensions
as $$
  insert into public.users (username, password_hash)
  values (p_username, crypt(p_password, gen_salt('bf')))
  returning users.id, users.username;
$$;

drop function if exists public.sign_in(text, text);
create function public.sign_in(p_username text, p_password text)
returns table (id uuid, username text, token uuid)
language sql
security definer
set search_path = public, extensions
as $$
  with matched as (
    select users.id, users.username
    from public.users
    where users.username = p_username
      and users.password_hash = crypt(p_password, users.password_hash)
  ), new_session as (
    insert into public.sessions (user_id)
    select matched.id from matched
    returning sessions.user_id, sessions.token
  )
  select matched.id, matched.username, new_session.token
  from matched
  join new_session on new_session.user_id = matched.id;
$$;

create or replace function public.sign_out(p_token uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.sessions where sessions.token = p_token;
$$;

create or replace function public.require_user(p_token uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select sessions.user_id into v_user_id
  from public.sessions
  where sessions.token = p_token
    and sessions.expires_at > now();

  if v_user_id is null then
    raise exception '로그인이 만료됐어요. 다시 로그인해주세요' using errcode = '28000';
  end if;

  return v_user_id;
end;
$$;

revoke all on function public.sign_up(text, text) from public;
revoke all on function public.sign_in(text, text) from public;
revoke all on function public.sign_out(uuid) from public;
revoke all on function public.require_user(uuid) from public, anon, authenticated;
grant execute on function public.sign_up(text, text) to anon, authenticated;
grant execute on function public.sign_in(text, text) to anon, authenticated;
grant execute on function public.sign_out(uuid) to anon, authenticated;
