//Supabase Database CRUD (groups, members, events)
import { supabase } from "./config.js";

// GROUP(그룹)
/**
 * 새로운 그룹을 생성하고 랜덤으로 코드 부여
 */
export async function createGroup(name) {
  // 6자리 대문자/숫자 조합 그룹 코드 생성
  const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  const { data, error } = await supabase
    .from("groups")
    .insert([{ code: randomCode, name }])
    .select()
    .single();

  if (error) throw error;
  return data; // { id, code, name, created_at, created_by }
}

/**
 * 그룹 코드로 그룹 정보 조회
 * ⚠️ groups 테이블 SELECT 정책은 "내가 이미 멤버인 그룹"만 허용하므로,
 *    아직 참여하지 않은 그룹을 코드로 찾을 때는 이 함수 대신 findGroupIdByCode()를 쓸 것.
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

/**
 * 초대 코드로 그룹 id를 조회합니다.
 * join_group_by_code RPC는 SECURITY DEFINER라 RLS를 우회하므로,
 * 아직 멤버가 아닌 사용자도 코드로 그룹을 찾을 수 있습니다.
 * 코드가 존재하지 않으면 에러를 던집니다.
 */
export async function findGroupIdByCode(code) {
  const { data, error } = await supabase.rpc("join_group_by_code", {
    invite_code: code,
  });
  if (error) throw error;
  return data;
}

/**
 * 내가 참여 중인 그룹 목록을, 각 그룹에서의 내 멤버 정보와 함께 가져옵니다.
 */
export async function getMyGroups() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;

  const { data, error } = await supabase
    .from("members")
    .select("id, name, color, group_id, groups(id, name, code, created_by)")
    .eq("user_id", userData.user.id);
  if (error) throw error;

  return data.map((row) => ({
    memberId: row.id,
    nickname: row.name,
    color: row.color,
    groupId: row.group_id,
    groupName: row.groups.name,
    groupCode: row.groups.code,
    isOwner: row.groups.created_by === userData.user.id,
  }));
}

/**
 * 그룹에서 이미 사용 중인 색상 목록을 가져옵니다 (색상 선택 시 중복 방지용).
 * get_group_used_colors RPC는 SECURITY DEFINER라 RLS를 우회하므로,
 * 아직 멤버가 아닌 사용자도 참여 전에 미리 확인할 수 있습니다.
 */
export async function getGroupUsedColors(groupId) {
  const { data, error } = await supabase.rpc("get_group_used_colors", {
    target_group_id: groupId,
  });
  if (error) throw error;
  return data || [];
}

/**
 * 그룹에서 나갑니다 (내 멤버 행만 삭제, 그룹 자체와 다른 멤버는 유지됨).
 */
export async function leaveGroup(memberId) {
  const { error } = await supabase.from("members").delete().eq("id", memberId);
  if (error) throw error;
}

/**
 * 그룹을 완전히 삭제합니다 (만든 사람만 가능 - DB 정책으로 강제됨).
 * members/events는 ON DELETE CASCADE로 함께 삭제됩니다.
 */
export async function deleteGroup(groupId) {
  const { error } = await supabase.from("groups").delete().eq("id", groupId);
  if (error) throw error;
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
 * 특정 그룹에서 내가 사용하는 닉네임을 수정합니다.
 */
export async function updateMemberName(memberId, name) {
  const { data, error } = await supabase
    .from("members")
    .update({ name })
    .eq("id", memberId)
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

// 4. PERSONAL EVENTS (그룹에 속하지 않는 나만의 개인 일정 CRUD)

/**
 * 내 개인 일정 전체를 가져옵니다 (그룹과 무관, 홈 화면 전용).
 */
export async function getPersonalEvents(userId) {
  const { data, error } = await supabase
    .from("personal_events")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * 신규 개인 일정을 등록합니다.
 */
export async function createPersonalEvent({ userId, title, date, time = null, memo = null, color = "gray" }) {
  const { data, error } = await supabase
    .from("personal_events")
    .insert([{ user_id: userId, title, date, time, memo, color }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * 기존 개인 일정을 수정합니다.
 */
export async function updatePersonalEvent(eventId, { title, date, time, memo, color }) {
  const { data, error } = await supabase
    .from("personal_events")
    .update({ title, date, time, memo, color })
    .eq("id", eventId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * 개인 일정을 삭제합니다.
 */
export async function deletePersonalEvent(eventId) {
  const { error } = await supabase.from("personal_events").delete().eq("id", eventId);

  if (error) throw error;
  return true;
}
