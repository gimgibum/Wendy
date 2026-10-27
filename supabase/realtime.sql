-- 그룹 일정 실시간 알림 (그룹원이 일정을 추가/수정/삭제하면 앱을 켜둔 다른 그룹원에게 바로 알려주기, js/realtime.js)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하면 됩니다. (여러 번 실행해도 괜찮음)
-- (대시보드 > Database > Publications > supabase_realtime 에서 events 를 켜는 것과 같음)

-- events 테이블의 변경 내용을 Realtime으로 보내도록 등록
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;
end $$;

-- 실시간 알림도 events 테이블의 SELECT 정책(RLS)을 그대로 따르므로,
-- 그룹 캘린더에서 볼 수 있는 일정(같은 그룹 일정)의 추가/수정만 전달됩니다.
-- 삭제는 Supabase가 지워진 일정의 id만 보내주므로, 앱이 미리 불러둔 내 그룹 일정 목록에서 찾아 알립니다.
