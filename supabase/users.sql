-- 아이디 + 비밀번호 계정 테이블, 로그인 세션(토큰) 및 로그인/회원가입/로그아웃 함수
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하면 됩니다. (여러 번 실행해도 괜찮음)

-- 이미 설치되어 있으면 (public 등 다른 스키마여도) 그대로 둠.
-- 그래서 아래 함수들은 crypt/gen_salt 를 스키마 이름 없이 부르고 search_path 로 찾음.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- 로그인 세션: 로그인할 때마다 추측할 수 없는 토큰을 하나 발급.
-- 브라우저는 이 토큰을 저장해 두었다가 일정 등 내 데이터를 요청할 때 함께 보내고,
-- DB 함수는 토큰으로 누구인지 확인함 (localStorage 의 id 만으로는 다른 사람인 척할 수 있으므로).
create table if not exists public.sessions (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

-- 정책(policy)을 하나도 만들지 않고 권한도 없애서 브라우저에서 테이블을 직접 읽거나 쓸 수 없음
-- (비밀번호 해시와 토큰이 노출되지 않도록). 접근은 아래 함수로만 가능.
alter table public.users enable row level security;
alter table public.sessions enable row level security;
revoke all on table public.users, public.sessions from anon, authenticated;

-- 회원가입: 비밀번호를 bcrypt 로 해시해서 저장 (아이디 중복이면 23505 에러)
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

-- 로그인: 아이디/비밀번호가 맞으면 세션 토큰을 새로 발급해서 한 줄, 틀리면 빈 결과
-- (예전 버전과 반환 형태가 달라서 create or replace 로는 바꿀 수 없으므로 지우고 다시 만듦)
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

-- 로그아웃: 세션 토큰을 지워서 더 이상 쓸 수 없게 함
create or replace function public.sign_out(p_token uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.sessions where sessions.token = p_token;
$$;

-- 토큰으로 로그인한 사용자 id 를 찾음. 토큰이 없거나 만료됐으면 28000 에러.
-- 일정 등 다른 함수 안에서만 쓰고 브라우저에서는 직접 부를 수 없음.
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
