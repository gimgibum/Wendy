//Supabase Database CRUD (groups, members, events)
import { supabase } from "./config.js";
import { getSessionToken, signOut } from "./auth.js";

// GROUP(그룹)
/**
 * 새로운 그룹을 생성하고 랜덤으로 코드 부여
 */
export async function createGroup() {
  // 6자리 대문자/숫자 조합 그룹 코드 생성
  const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  const { data, error } = await supabase
    .from("groups")
    .insert([{ code: randomCode }])
    .select()
    .single();

  if (error) throw error;
  return data; // { id, code, created_at }
}

/**
 * 그룹 코드로 그룹 정보 조회
 */
export async function getGroupByCode(groupCode) {
  const { data, error } = await supabase
    .from("groups")
    .select("*")
    .eq("code", groupCode)
    .maybeSingle();

  if (error) throw error;
  return data;
}


// 2. MEMBERS (그룹 멤버 및 개인 설정 관련)

/**
 * 로그인한 사용자를 특정 그룹의 멤버로 등록
 */
export async function joinGroupMember({
  userId,
  groupId,
  name,
  color,
  schoolCode = null,
  officeCode = null,
}) {
  const { data, error } = await supabase
    .from("members")
    .insert([
      {
        user_id: userId,
        group_id: groupId,
        name: name,
        color: color,
        school_code: schoolCode,
        office_code: officeCode,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * 특정 그룹에 속한 전체 멤버 목록을 조회 (그룹원 색상 및 학교 정보 확인용)
 */
export async function getGroupMembers(groupId) {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("group_id", groupId);

  if (error) throw error;
  return data;
}

/**
 * 내 멤버 정보의 학교/교육청 코드를 업데이트
 */
export async function updateMemberSchoolInfo(memberId, schoolCode, officeCode) {
  const { data, error } = await supabase
    .from("members")
    .update({
      school_code: schoolCode,
      office_code: officeCode,
      school_synced_at: new Date().toISOString(),
    })
    .eq("id", memberId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// 3. EVENTS (내 일정 CRUD) — supabase/events.sql 의 함수 사용
// 테이블에 직접 접근할 수 없고, 세션 토큰을 함께 보내서 DB 함수가 본인 일정만 다루도록 함

/**
 * 세션 토큰을 붙여서 DB 함수(RPC) 호출
 * 토큰이 만료됐거나 잘못됐으면(28000) 로그아웃하고 로그인 화면으로 보냄
 */
async function rpcWithSession(fn, params = {}) {
  const { data, error } = await supabase.rpc(fn, {
    p_token: getSessionToken(),
    ...params,
  });

  if (error) {
    if (error.code === "28000") {
      await signOut();
      window.location.replace("index.html");
    }
    throw error;
  }
  return data;
}

/**
 * 내 일정 전체 조회 (날짜, 시간 순)
 * @returns {Promise<Array>} [{ id, title, date: 'YYYY-MM-DD', time: 'HH:MM:SS' | null, memo, ... }]
 */
export async function getMyEvents() {
  return rpcWithSession("get_my_events");
}

/**
 * 새 일정 등록
 * @returns {Promise<Object>} 저장된 일정
 */
export async function createEvent({ title, date, time = null, memo = null }) {
  return rpcWithSession("create_event", {
    p_title: title,
    p_date: date,
    p_time: time,
    p_memo: memo,
  });
}

/**
 * 내 일정 수정
 * @returns {Promise<Object>} 수정된 일정
 */
export async function updateEvent(eventId, { title, date, time = null, memo = null }) {
  return rpcWithSession("update_event", {
    p_event_id: eventId,
    p_title: title,
    p_date: date,
    p_time: time,
    p_memo: memo,
  });
}

/**
 * 내 일정 삭제
 */
export async function deleteEvent(eventId) {
  await rpcWithSession("delete_event", { p_event_id: eventId });
  return true;
}
