//Supabase Realtime 구독 (실시간 이벤트 반영)
// 내가 참여 중인 그룹들의 일정이 추가/수정/삭제되면 알려주기 위한 로직.
// 앱을 켜둔 동안은 Supabase Realtime으로 바로 받고, 앱을 꺼둔 사이에 바뀐 일정은
// 지난번에 본 그룹 일정을 브라우저(localStorage)에 저장해뒀다가 다음 접속 때 비교해서 찾습니다.
// ⚠️ Supabase에서 events 테이블의 Realtime이 켜져 있어야 함 (supabase/realtime.sql 실행)
import { supabase } from "./config.js";
import { getGroupEvents, getGroupMembers } from "./db.js";

const STORAGE_PREFIX = "wendy:groupSnapshot";
// 범위 선택으로 일정을 여러 개 한꺼번에 등록하면 변경이 연달아 들어오므로, 잠깐 모았다가 한 번에 알림
const BATCH_DELAY = 1500;
const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

// 그룹 목록이 바뀌어 다시 구독할 때, 정리 중인 이전 채널과 이름이 겹치지 않도록 붙이는 번호
let channelSeq = 0;

/**
 * DB 일정 한 줄에서 변경 비교에 필요한 값만 뽑습니다.
 */
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

/**
 * 같은 일정의 이전/새 값을 비교해 바뀐 점을 반환합니다. 바뀐 게 없으면 null.
 * @returns {{type: "added"|"removed"|"updated", groupId, memberId, title, date, oldTitle?, oldDate?} | null}
 */
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

function saveSnapshot(storageKey, known) {
  // { 그룹id: { 일정id: entry } } 형태로 저장
  const groups = {};
  known.forEach((entry, eventId) => {
    if (!groups[entry.groupId]) groups[entry.groupId] = {};
    groups[entry.groupId][eventId] = entry;
  });
  try {
    localStorage.setItem(storageKey, JSON.stringify({ groups }));
  } catch (err) {
    // 저장 공간이 없거나 막혀 있으면 다음 접속 때는 실시간으로 받은 변경만 알림
  }
}

/**
 * 내가 참여 중인 그룹들의 일정 변경을 지켜보기 시작합니다.
 * 처음 시작할 때 지난번 접속 이후 바뀐 일정을 한 번 알려주고, 그 뒤로는 바뀔 때마다 알려줍니다.
 * @param {string} userId
 * @param {Array<{groupId: string, groupName: string, memberId: string}>} groups 내 그룹 목록 (getMyGroups 형식)
 * @param {(changes: Array) => void} onChanges 바뀐 일정 목록 (diffEntry 형식 + groupName, memberName, isMine)
 * @returns {() => void} 지켜보기를 멈추는 함수
 */
export function watchGroupEvents(userId, groups, onChanges) {
  if (groups.length === 0) return () => {};

  const storageKey = `${STORAGE_PREFIX}:${userId}`;
  // 지금까지 알고 있는 내 그룹 일정 (key: 일정 id) - 삭제 알림은 일정 id만 오기 때문에 무엇이 지워졌는지 여기서 찾음
  const known = new Map();
  // 처음 불러오기가 끝났는지 / 내 그룹 일정을 전부 제대로 불러왔는지
  // (일부만 불러온 상태로 기록을 저장하면 다음 접속 때 잘못 비교하게 되므로, 전부 불러왔을 때만 저장)
  let loaded = false;
  let hasFullList = false;
  let stopped = false;
  // 처음 불러오기가 끝나기 전에 들어온 실시간 변경 (불러온 뒤에 이어서 반영)
  let queued = [];
  let pending = [];
  let batchTimer = null;

  async function resolveChanges(changes) {
    // 닉네임은 바뀔 수 있고 새 멤버가 들어올 수도 있어서, 알릴 때마다 그 그룹 멤버를 새로 불러옴
    const memberNames = new Map();
    const groupIds = [...new Set(changes.map((change) => change.groupId))];
    await Promise.all(
      groupIds.map(async (groupId) => {
        try {
          (await getGroupMembers(groupId)).forEach((member) => memberNames.set(member.id, member.name));
        } catch (err) {
          // 멤버 이름을 못 불러와도 알림은 "그룹원"으로 표시
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
      // 모르는 일정이면 다른 그룹 일정이므로 무시
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
    // 알림을 띄우기 전에 앱을 닫아도 다음 접속 때 같은 변경을 또 알리지 않도록 바로 저장
    if (hasFullList) saveSnapshot(storageKey, known);
    addChanges([change], false);
  }

  // 불러오는 사이에 바뀐 일정을 놓치지 않도록 구독을 먼저 시작
  const filter = `group_id=in.(${groups.map((g) => g.groupId).join(",")})`;
  const channel = supabase
    .channel(`group-events:${userId}:${++channelSeq}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "events", filter }, handlePayload)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "events", filter }, handlePayload)
    // 삭제는 Supabase에서 필터를 걸 수 없어서 전부 받고, 내 그룹 일정인지는 known으로 판단
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "events" }, handlePayload)
    .subscribe((status, err) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("그룹 일정 실시간 연결에 실패했어요", err);
      }
    });

  (async () => {
    let current;
    try {
      current = await Promise.all(groups.map((g) => getGroupEvents(g.groupId)));
    } catch (err) {
      // 그룹 일정을 못 불러와도 새로 추가/수정되는 일정은 실시간으로 받을 수 있음
      console.warn("그룹 일정 변경 확인을 위한 일정을 불러오지 못했어요", err);
    }
    if (stopped) return;

    const startupChanges = [];
    if (current) {
      current.flat().forEach((row) => known.set(row.id, toEntry(row)));
      hasFullList = true;

      // 지난번 접속 때 저장해둔 그룹 일정과 비교 (새로 들어온 그룹은 비교할 기록이 없으므로 건너뜀)
      const previous = readSnapshot(storageKey);
      if (previous && previous.groups) {
        groups.forEach(({ groupId }) => {
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
    if (hasFullList) saveSnapshot(storageKey, known);
    if (startupChanges.length > 0) addChanges(startupChanges, true);
    if (realtimeChanges.length > 0) addChanges(realtimeChanges, false);
  })();

  return () => {
    stopped = true;
    clearTimeout(batchTimer);
    supabase.removeChannel(channel);
  };
}

function formatDate(ymd) {
  const [yyyy, mm, dd] = ymd.split("-").map(Number);
  const date = new Date(yyyy, mm - 1, dd);
  return `${mm}월 ${dd}일(${WEEKDAY_NAMES[date.getDay()]})`;
}

/**
 * 바뀐 그룹 일정 하나를 알림에 보여줄 문장으로 바꿉니다.
 */
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
