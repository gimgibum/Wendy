-- 일정 실시간 반영 (js/realtime.js)
-- - events: 그룹원이 일정을 추가/수정/삭제하면 앱을 켜둔 다른 그룹원에게 바로 알려주기
-- - personal_events: 다른 탭이나 다른 컴퓨터에서 바꾼 내 개인 일정을 바로 반영하기
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하면 됩니다. (여러 번 실행해도 괜찮음)
-- (대시보드 > Database > Publications > supabase_realtime 에서 events, personal_events 를 켜는 것과 같음)

-- 두 테이블의 변경 내용을 Realtime으로 보내도록 등록
-- (실시간 등록 목록 supabase_realtime 이 없는 프로젝트도 있어서, 없으면 먼저 만듦)
do $$
declare
  v_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach v_table in array array['events', 'personal_events'] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end $$;

-- 실시간 알림도 각 테이블의 SELECT 정책(RLS)을 그대로 따르므로,
-- 볼 수 있는 일정(같은 그룹 일정 / 내 개인 일정)의 추가/수정만 전달됩니다.
-- 삭제는 Supabase가 지워진 일정의 id만 보내주므로, 앱이 미리 불러둔 일정 목록에서 찾아 반영합니다.

-- 확인: 결과에 events, personal_events 가 나오면 성공
select tablename from pg_publication_tables where pubname = 'supabase_realtime';
