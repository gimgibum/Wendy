-- 초대 코드로 그룹 참여 (RPC)
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

revoke all on function public.join_group_with_code from public, anon;
grant execute on function public.join_group_with_code to authenticated;
