-- 일정 테이블, RLS 정책 (users.sql 다음에 실행)
alter table public.events
  add column if not exists user_id uuid references public.users(id) on delete cascade;
alter table public.events alter column group_id drop not null;
alter table public.events alter column member_id drop not null;
create index if not exists events_user_id_date_idx on public.events (user_id, date);

alter table public.events enable row level security;
revoke all on table public.events from anon, authenticated;

create or replace function public.get_my_events(p_token uuid)
returns setof public.events
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.require_user(p_token);
begin
  return query
    select *
    from public.events
    where events.user_id = v_user_id
    order by events.date, events.time nulls first;
end;
$$;

create or replace function public.create_event(
  p_token uuid,
  p_title text,
  p_date date,
  p_time time default null,
  p_memo text default null
)
returns public.events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.require_user(p_token);
  v_event public.events;
begin
  if coalesce(trim(p_title), '') = '' then
    raise exception '제목을 입력해주세요' using errcode = '22023';
  end if;

  insert into public.events (user_id, title, date, time, memo)
  values (v_user_id, trim(p_title), p_date, p_time, p_memo)
  returning * into v_event;

  return v_event;
end;
$$;

create or replace function public.update_event(
  p_token uuid,
  p_event_id uuid,
  p_title text,
  p_date date,
  p_time time default null,
  p_memo text default null
)
returns public.events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.require_user(p_token);
  v_event public.events;
begin
  if coalesce(trim(p_title), '') = '' then
    raise exception '제목을 입력해주세요' using errcode = '22023';
  end if;

  update public.events
  set title = trim(p_title), date = p_date, time = p_time, memo = p_memo
  where events.id = p_event_id
    and events.user_id = v_user_id
  returning * into v_event;

  if not found then
    raise exception '일정을 찾을 수 없어요' using errcode = 'P0002';
  end if;

  return v_event;
end;
$$;

create or replace function public.delete_event(p_token uuid, p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.require_user(p_token);
begin
  delete from public.events
  where events.id = p_event_id
    and events.user_id = v_user_id;
end;
$$;

revoke all on function public.get_my_events(uuid) from public;
revoke all on function public.create_event(uuid, text, date, time, text) from public;
revoke all on function public.update_event(uuid, uuid, text, date, time, text) from public;
revoke all on function public.delete_event(uuid, uuid) from public;
grant execute on function public.get_my_events(uuid) to anon, authenticated;
grant execute on function public.create_event(uuid, text, date, time, text) to anon, authenticated;
grant execute on function public.update_event(uuid, uuid, text, date, time, text) to anon, authenticated;
grant execute on function public.delete_event(uuid, uuid) to anon, authenticated;
