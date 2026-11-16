// 실시간 동기화 (Supabase Realtime)
import { supabase } from "./config.js";
import { getGroupEvents, getGroupMembers } from "./db.js";

const STORAGE_PREFIX = "wendy:groupSnapshot";
const BATCH_DELAY = 1500;
const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

let channelSeq = 0;

function toEntry(row) {
  return {
    groupId: row.group_id,
    memberId: row.member_id,
    title: row.title,
    date: row.date,
    time: row.time || null,
    memo: row.memo || null,
  };
}

function diffEntry(before, after) {
  if (!before && !after) return null;
  if (!before) return { type: "added", ...after };
  if (!after) return { type: "removed", ...before };
  if (
    before.title === after.title &&
    before.date === after.date &&
    before.time === after.time &&
    before.memo === after.memo
  ) {
    return null;
  }
  return { type: "updated", ...after, oldTitle: before.title, oldDate: before.date };
}

function readSnapshot(storageKey) {
  try {
    return JSON.parse(localStorage.getItem(storageKey));
  } catch (err) {
    return null;
  }
}

function saveSnapshot(storageKey, groupIds, known) {
  const groups = {};
  groupIds.forEach((groupId) => {
    groups[groupId] = {};
  });
  known.forEach((entry, eventId) => {
    if (!groups[entry.groupId]) groups[entry.groupId] = {};
    groups[entry.groupId][eventId] = entry;
  });
  try {
    localStorage.setItem(storageKey, JSON.stringify({ groups }));
  } catch (err) {
  }
}

// 그룹 일정 변경 감지
export function watchGroupEvents(userId, groups, onChanges) {
  if (groups.length === 0) return () => {};

  const groupIds = groups.map((g) => g.groupId);
  const storageKey = `${STORAGE_PREFIX}:${userId}`;
  const known = new Map();
  let loaded = false;
  let hasFullList = false;
  let stopped = false;
  let queued = [];
  let pending = [];
  let batchTimer = null;

  async function resolveChanges(changes) {
    const memberNames = new Map();
    const groupIds = [...new Set(changes.map((change) => change.groupId))];
    await Promise.all(
      groupIds.map(async (groupId) => {
        try {
          (await getGroupMembers(groupId)).forEach((member) => memberNames.set(member.id, member.name));
        } catch (err) {
        }
      }),
    );
    return changes
      .map((change) => {
        const group = groups.find((g) => g.groupId === change.groupId);
        return {
          ...change,
          groupName: group.groupName,
          memberName: memberNames.get(change.memberId) || "그룹원",
          isMine: change.memberId === group.memberId,
        };
      })
      .sort((x, y) => x.date.localeCompare(y.date));
  }

  async function flush() {
    batchTimer = null;
    const changes = pending;
    pending = [];
    if (stopped || changes.length === 0) return;
    const resolved = await resolveChanges(changes);
    if (!stopped) onChanges(resolved);
  }

  function addChanges(changes, immediately) {
    pending.push(...changes);
    clearTimeout(batchTimer);
    if (immediately) flush();
    else batchTimer = setTimeout(flush, BATCH_DELAY);
  }

  function applyPayload(payload) {
    if (payload.eventType === "DELETE") {
      const before = known.get(payload.old.id);
      if (!before) return null;
      known.delete(payload.old.id);
      return diffEntry(before, null);
    }
    const after = toEntry(payload.new);
    const before = known.get(payload.new.id);
    known.set(payload.new.id, after);
    return diffEntry(before, after);
  }

  function handlePayload(payload) {
    if (stopped) return;
    if (!loaded) {
      queued.push(payload);
      return;
    }
    const change = applyPayload(payload);
    if (!change) return;
    if (hasFullList) saveSnapshot(storageKey, groupIds, known);
    addChanges([change], false);
  }

  const filter = `group_id=in.(${groupIds.join(",")})`;
  const channel = supabase
    .channel(`group-events:${userId}:${++channelSeq}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "events", filter }, handlePayload)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "events", filter }, handlePayload)
    // 삭제는 필터가 안 돼서 전부 받음
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "events" }, handlePayload)
    .subscribe((status, err) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("그룹 일정 실시간 연결에 실패했어요", err);
      }
    });

  (async () => {
    let current;
    try {
      current = await Promise.all(groupIds.map((groupId) => getGroupEvents(groupId)));
    } catch (err) {
      console.warn("그룹 일정 변경 확인을 위한 일정을 불러오지 못했어요", err);
    }
    if (stopped) return;

    const startupChanges = [];
    if (current) {
      current.flat().forEach((row) => known.set(row.id, toEntry(row)));
      hasFullList = true;

      const previous = readSnapshot(storageKey);
      if (previous && previous.groups) {
        groupIds.forEach((groupId) => {
          const before = previous.groups[groupId];
          if (!before) return;
          const after = {};
          known.forEach((entry, eventId) => {
            if (entry.groupId === groupId) after[eventId] = entry;
          });
          new Set([...Object.keys(before), ...Object.keys(after)]).forEach((eventId) => {
            const change = diffEntry(before[eventId], after[eventId]);
            if (change) startupChanges.push(change);
          });
        });
      }
    }

    loaded = true;
    const realtimeChanges = queued.map(applyPayload).filter(Boolean);
    queued = [];
    if (hasFullList) saveSnapshot(storageKey, groupIds, known);
    if (startupChanges.length > 0) addChanges(startupChanges, true);
    if (realtimeChanges.length > 0) addChanges(realtimeChanges, false);
  })();

  return () => {
    stopped = true;
    clearTimeout(batchTimer);
    supabase.removeChannel(channel);
  };
}

// 개인 일정 변경 감지
export function watchPersonalEvents(userId, onChange) {
  const filter = `user_id=eq.${userId}`;
  const channel = supabase
    .channel(`personal-events:${userId}:${++channelSeq}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "personal_events", filter }, onChange)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "personal_events", filter }, onChange)
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "personal_events" }, onChange)
    .subscribe((status, err) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("개인 일정 실시간 연결에 실패했어요", err);
      }
    });

  return () => supabase.removeChannel(channel);
}

function formatDate(ymd) {
  const [yyyy, mm, dd] = ymd.split("-").map(Number);
  const date = new Date(yyyy, mm - 1, dd);
  return `${mm}월 ${dd}일(${WEEKDAY_NAMES[date.getDay()]})`;
}

// 알림 문구
export function formatGroupEventChange(change) {
  const who = change.memberName;
  switch (change.type) {
    case "added":
      return `${who}: ${formatDate(change.date)} ${change.title} 추가`;
    case "removed":
      return `${who}: ${formatDate(change.date)} ${change.title} 삭제`;
    case "updated":
      if (change.oldDate !== change.date) {
        return `${who}: ${change.title} 날짜 변경 ${formatDate(change.oldDate)} → ${formatDate(change.date)}`;
      }
      if (change.oldTitle !== change.title) {
        return `${who}: ${formatDate(change.date)} ${change.oldTitle} → ${change.title}`;
      }
      return `${who}: ${formatDate(change.date)} ${change.title} 수정`;
    default:
      return "";
  }
}
