// DB 연결 (그룹, 멤버, 일정)
import { supabase } from "./config.js";

// 그룹 관리
export async function createGroup(name) {
  const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  const { data, error } = await supabase
    .from("groups")
    .insert([{ code: randomCode, name }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getGroupByCode(groupCode) {
  const { data, error } = await supabase
    .from("groups")
    .select("*")
    .eq("code", groupCode)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// RLS 우회 RPC
export async function findGroupIdByCode(code) {
  const { data, error } = await supabase.rpc("join_group_by_code", {
    invite_code: code,
  });
  if (error) throw error;
  return data;
}

export async function getMyGroups() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;

  const { data, error } = await supabase
    .from("members")
    .select("id, name, color, group_id, school_code, office_code, groups(id, name, code, created_by)")
    .eq("user_id", userData.user.id);
  if (error) throw error;

  return data.map((row) => ({
    memberId: row.id,
    nickname: row.name,
    color: row.color,
    schoolCode: row.school_code,
    officeCode: row.office_code,
    groupId: row.group_id,
    groupName: row.groups.name,
    groupCode: row.groups.code,
    ownerId: row.groups.created_by,
    isOwner: row.groups.created_by === userData.user.id,
  }));
}

// 그룹장 전용
export async function renameGroup(groupId, name) {
  const { data, error } = await supabase.rpc("update_group_name", {
    p_group_id: groupId,
    p_name: name,
  });
  if (error) throw error;
  return data;
}

export async function kickGroupMember(memberId) {
  const { error } = await supabase.rpc("kick_group_member", {
    p_member_id: memberId,
  });
  if (error) throw error;
}

export async function getGroupUsedColors(groupId) {
  const { data, error } = await supabase.rpc("get_group_used_colors", {
    target_group_id: groupId,
  });
  if (error) throw error;
  return data || [];
}

export async function leaveGroup(memberId) {
  const { error } = await supabase.from("members").delete().eq("id", memberId);
  if (error) throw error;
}

export async function deleteGroup(groupId) {
  const { error } = await supabase.from("groups").delete().eq("id", groupId);
  if (error) throw error;
}


// 멤버 관리
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

// 초대 코드로 참여 (RPC)
export async function joinGroupByCode({ code, name, color, schoolCode = null, officeCode = null }) {
  const { data, error } = await supabase.rpc("join_group_with_code", {
    p_invite_code: code,
    p_name: name,
    p_color: color,
    p_school_code: schoolCode,
    p_office_code: officeCode,
  });
  if (error) throw error;
  return data;
}

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

export async function updateMemberColor(memberId, color) {
  const { data, error } = await supabase
    .from("members")
    .update({ color })
    .eq("id", memberId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getGroupMembers(groupId) {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("group_id", groupId);

  if (error) throw error;
  return data;
}

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

// 그룹 일정
export async function getGroupEvents(groupId) {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("group_id", groupId)
    .order("date", { ascending: true });

  if (error) throw error;
  return data;
}

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

export async function deleteEvent(eventId) {
  const { error } = await supabase.from("events").delete().eq("id", eventId);

  if (error) throw error;
  return true;
}

// 개인 일정
export async function getPersonalEvents(userId) {
  const { data, error } = await supabase
    .from("personal_events")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: true });

  if (error) throw error;
  return data;
}

export async function createPersonalEvent({ userId, title, date, time = null, memo = null, color = "gray" }) {
  const { data, error } = await supabase
    .from("personal_events")
    .insert([{ user_id: userId, title, date, time, memo, color }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

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

export async function deletePersonalEvent(eventId) {
  const { error } = await supabase.from("personal_events").delete().eq("id", eventId);

  if (error) throw error;
  return true;
}
