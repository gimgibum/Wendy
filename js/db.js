//Supabase Database CRUD (groups, members, events)
import { supabase } from "./config.js";

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

// 3. EVENTS (개인 일정 CRUD)

/**
 * 특정 그룹의 모든 개인 일정을 가져옵니다.
 */
export async function getGroupEvents(groupId) {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("group_id", groupId)
    .order("date", { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * 신규 일정을 등록
 */
export async function createEvent({
  groupId,
  memberId,
  title,
  date,
  time = null,
  memo = null,
}) {
  const { data, error } = await supabase
    .from("events")
    .insert([
      {
        group_id: groupId,
        member_id: memberId,
        title: title,
        date: date,
        time: time,
        memo: memo,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * 기존 일정을 수정
 */
export async function updateEvent(eventId, { title, date, time, memo }) {
  const { data, error } = await supabase
    .from("events")
    .update({
      title,
      date,
      time,
      memo,
    })
    .eq("id", eventId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * 일정 삭제
 */
export async function deleteEvent(eventId) {
  const { error } = await supabase.from("events").delete().eq("id", eventId);

  if (error) throw error;
  return true;
}
