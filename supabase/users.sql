-- 아이디 + 비밀번호 계정 테이블 및 로그인/회원가입 함수
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 한 번 실행하면 됩니다.

-- 이미 설치되어 있으면 (public 등 다른 스키마여도) 그대로 둠.
-- 그래서 아래 함수들은 crypt/gen_salt 를 스키마 이름 없이 부르고 search_path 로 찾음.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- 정책(policy)을 하나도 만들지 않으므로 브라우저에서 테이블을 직접 읽거나 쓸 수 없음
-- (비밀번호 해시가 노출되지 않도록). 접근은 아래 함수로만 가능.
alter table public.users enable row level security;

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

-- 로그인: 아이디/비밀번호가 맞으면 한 줄, 틀리면 빈 결과
create or replace function public.sign_in(p_username text, p_password text)
returns table (id uuid, username text)
language sql
security definer
set search_path = public, extensions
as $$
  select users.id, users.username
  from public.users
  where users.username = p_username
    and users.password_hash = crypt(p_password, users.password_hash);
$$;

revoke all on function public.sign_up(text, text) from public;
revoke all on function public.sign_in(text, text) from public;
grant execute on function public.sign_up(text, text) to anon, authenticated;
grant execute on function public.sign_in(text, text) to anon, authenticated;
