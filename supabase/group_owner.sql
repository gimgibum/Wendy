-- 그룹장 기능: 그룹 이름 변경, 멤버 내보내기 (RPC)
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

revoke all on function public.update_group_name from public, anon;
revoke all on function public.kick_group_member from public, anon;
grant execute on function public.update_group_name to authenticated;
grant execute on function public.kick_group_member to authenticated;
