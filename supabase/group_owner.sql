-- 그룹장 전용 기능: 그룹 이름 변경, 멤버 내보내기 (js/db.js 의 renameGroup, kickGroupMember)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하면 됩니다. (여러 번 실행해도 괜찮음)
--
-- 다른 멤버의 members 행을 지우거나 groups 를 고치는 건 RLS 정책으로 막혀 있으므로,
-- 이 함수들이 대신 처리함 (SECURITY DEFINER).
-- 대신 함수 안에서 로그인한 계정(auth.uid())이 그 그룹을 만든 사람(groups.created_by)인지 직접 확인하므로,
-- 그룹장만 쓸 수 있음.
-- 매개변수 타입은 테이블의 컬럼 타입을 그대로 따름 (%TYPE, 실행 시 NOTICE 가 떠도 정상)

-- 그룹 이름 변경 → 바뀐 그룹 한 줄 반환
create or replace function public.update_group_name(
  p_group_id public.groups.id%type,
  p_name public.groups.name%type
)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_group public.groups;
begin
  if v_user_id is null then
    raise exception '로그인이 만료됐어요. 다시 로그인해주세요' using errcode = '28000';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception '그룹 이름을 입력해주세요' using errcode = '22023';
  end if;

  update public.groups
  set name = trim(p_name)
  where groups.id = p_group_id
    and groups.created_by = v_user_id
  returning * into v_group;

  if not found then
    raise exception '그룹장만 그룹 이름을 바꿀 수 있어요' using errcode = '42501';
  end if;

  return v_group;
end;
$$;

-- 멤버 내보내기: 그 멤버가 이 그룹에 올린 일정도 함께 지움 (그룹장 본인은 내보낼 수 없음)
create or replace function public.kick_group_member(
  p_member_id public.members.id%type
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_member public.members;
begin
  if v_user_id is null then
    raise exception '로그인이 만료됐어요. 다시 로그인해주세요' using errcode = '28000';
  end if;

  select * into v_member
  from public.members
  where members.id = p_member_id;

  if not found then
    raise exception '이미 그룹에 없는 멤버예요' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.groups
    where groups.id = v_member.group_id and groups.created_by = v_user_id
  ) then
    raise exception '그룹장만 멤버를 내보낼 수 있어요' using errcode = '42501';
  end if;

  if v_member.user_id = v_user_id then
    raise exception '그룹장은 자기 자신을 내보낼 수 없어요' using errcode = '22023';
  end if;

  delete from public.events where events.member_id = p_member_id;
  delete from public.members where members.id = p_member_id;
end;
$$;

-- 로그인한 사용자만 부를 수 있게 함 (로그인 안 한 anon 은 불가)
revoke all on function public.update_group_name from public, anon;
revoke all on function public.kick_group_member from public, anon;
grant execute on function public.update_group_name to authenticated;
grant execute on function public.kick_group_member to authenticated;
