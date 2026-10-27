-- 초대 코드로 그룹 참여 (members 테이블에 내 멤버 정보 추가, js/db.js 의 joinGroupByCode)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하면 됩니다. (여러 번 실행해도 괜찮음)
--
-- 아직 멤버가 아닌 사용자는 groups/members 의 RLS 정책 때문에 members 에 직접 추가하면
-- "new row violates row-level security policy" 로 막히므로, 이 함수가 대신 추가함 (SECURITY DEFINER).
-- 대신 함수 안에서 초대 코드와 로그인한 계정(auth.uid())을 직접 확인하므로,
-- 코드를 아는 사람만, 그리고 본인 계정으로만 참여할 수 있음.
-- 매개변수 타입은 members 테이블의 컬럼 타입을 그대로 따름 (%TYPE, 실행 시 NOTICE 가 떠도 정상)
--
-- 함수 이름이 join_group 이 아닌 이유: DB 에 이미 같은 이름의 다른 함수(join_group)가 있어서 겹치지 않게 함.
-- 원래 있던 join_group 은 건드리지 않음.

-- 이 파일의 예전 버전(이름이 join_group)으로 만들어진 함수가 남아 있으면 지움
-- (첫 매개변수 이름이 p_invite_code 인 것만 지우므로, 원래 있던 join_group 은 그대로 남음)
do $$
declare
  v_fn regprocedure;
begin
  for v_fn in
    select p.oid::regprocedure
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname = 'join_group'
      and p.proargnames[1] = 'p_invite_code'
  loop
    execute format('drop function %s', v_fn);
  end loop;
end $$;

create or replace function public.join_group_with_code(
  p_invite_code public.groups.code%type,
  p_name public.members.name%type,
  p_color public.members.color%type,
  p_school_code public.members.school_code%type default null,
  p_office_code public.members.office_code%type default null
)
returns public.members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id public.groups.id%type;
  v_member public.members;
begin
  if v_user_id is null then
    raise exception '로그인이 만료됐어요. 다시 로그인해주세요' using errcode = '28000';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception '닉네임을 입력해주세요' using errcode = '22023';
  end if;

  select groups.id into v_group_id
  from public.groups
  where groups.code = upper(trim(p_invite_code));

  if v_group_id is null then
    raise exception '존재하지 않는 초대 코드예요. 코드를 다시 확인해주세요.' using errcode = 'P0002';
  end if;

  -- 앱은 23505 에러 메시지에 "color" 가 있으면 색상 중복, 없으면 이미 참여 중으로 안내함
  if exists (
    select 1 from public.members
    where members.group_id = v_group_id and members.user_id = v_user_id
  ) then
    raise exception '이미 참여 중인 그룹입니다' using errcode = '23505';
  end if;

  if exists (
    select 1 from public.members
    where members.group_id = v_group_id and members.color = p_color
  ) then
    raise exception 'color "%" is already used in this group', p_color using errcode = '23505';
  end if;

  insert into public.members (user_id, group_id, name, color, school_code, office_code)
  values (v_user_id, v_group_id, trim(p_name), p_color, p_school_code, p_office_code)
  returning * into v_member;

  return v_member;
end;
$$;

-- 로그인한 사용자만 부를 수 있게 함 (로그인 안 한 anon 은 불가)
revoke all on function public.join_group_with_code from public, anon;
grant execute on function public.join_group_with_code to authenticated;
