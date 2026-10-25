//학사일정 변경 감지 (내 학교 학사일정이 추가/삭제/변경되면 알려주기 위한 비교 로직)
// NEIS 학사일정에는 "언제 수정됐는지" 정보가 없어서 (LOAD_DTM은 매일 다시 적재되는 날짜라 항상 오늘),
// 지난번에 확인한 학사일정을 브라우저(localStorage)에 저장해두고, 새로 받아온 학사일정과 비교합니다.
import { getSchoolSchedule } from "./neisApi.js";

// 오늘부터 앞으로 이 기간의 학사일정 변경을 지켜봄
const WATCH_DAYS = 180;
const STORAGE_PREFIX = "wendy:schoolSnapshot";
const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

function formatYmd(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

/**
 * 학사일정 목록을 { "YYYYMMDD": ["행사명", ...] } 형태로 정리합니다.
 * 매주 들어 있는 토요휴업일과, 공휴일 표시와 겹치는 공휴일은 달력에도 안 보이므로 비교에서 뺍니다.
 */
export function buildSnapshot(rows) {
  return rows.reduce((acc, row) => {
    if (row.eventName === "토요휴업일" || row.dayType === "공휴일") return acc;
    if (!acc[row.date]) acc[row.date] = [];
    acc[row.date].push(row.eventName);
    return acc;
  }, {});
}

/**
 * 빠진 일정(removed)과 생긴 일정(added) 중 isPair 조건이 맞는 짝을 찾아 반환하고, 두 목록에서는 뺍니다.
 */
function takePairs(removed, added, isPair) {
  const pairs = [];
  for (let i = 0; i < removed.length; ) {
    const j = added.findIndex((a) => isPair(removed[i], a));
    if (j >= 0) {
      pairs.push([removed[i], added[j]]);
      removed.splice(i, 1);
      added.splice(j, 1);
    } else {
      i += 1;
    }
  }
  return pairs;
}

/**
 * 이전/새 학사일정을 fromYmd~toYmd 범위 안에서 비교해 바뀐 점 목록을 반환합니다.
 * @returns {Array<{type: "added"|"removed"|"moved"|"renamed", date: string, name: string, fromDate?: string, oldName?: string}>}
 */
export function diffSnapshots(before, after, fromYmd, toYmd) {
  const dates = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((date) => date >= fromYmd && date <= toYmd)
    .sort();

  const added = [];
  const removed = [];
  dates.forEach((date) => {
    const remaining = [...(before[date] || [])];
    (after[date] || []).forEach((name) => {
      const index = remaining.indexOf(name);
      if (index >= 0) remaining.splice(index, 1);
      else added.push({ date, name });
    });
    remaining.forEach((name) => removed.push({ date, name }));
  });

  const changes = [];
  // 같은 행사가 다른 날짜로 옮겨졌으면 "날짜 변경"
  takePairs(removed, added, (r, a) => r.name === a.name).forEach(([r, a]) => {
    changes.push({ type: "moved", date: a.date, name: a.name, fromDate: r.date });
  });
  // 같은 날짜에서 행사 하나가 빠지고 하나가 생겼으면 "이름 변경"
  takePairs(removed, added, (r, a) => r.date === a.date).forEach(([r, a]) => {
    changes.push({ type: "renamed", date: a.date, name: a.name, oldName: r.name });
  });
  added.forEach((a) => changes.push({ type: "added", ...a }));
  removed.forEach((r) => changes.push({ type: "removed", ...r }));

  return changes.sort((x, y) => x.date.localeCompare(y.date));
}

function readSnapshot(storageKey) {
  try {
    return JSON.parse(localStorage.getItem(storageKey));
  } catch (err) {
    return null;
  }
}

function saveSnapshot(storageKey, snapshot) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch (err) {
    // 저장 공간이 없거나 막혀 있으면 다음 확인 때 처음부터 다시 비교
  }
}

/**
 * 내 학교의 앞으로 6개월 학사일정을 받아와, 지난번에 저장해둔 학사일정과 비교합니다.
 * 처음 확인할 때는 비교할 기록이 없으므로 저장만 하고 빈 배열을 반환합니다.
 * @param {string} userId
 * @param {{code: string, officeCode: string}} school
 * @returns {Promise<Array>} 바뀐 점 목록 (diffSnapshots 형식)
 */
export async function checkSchoolScheduleUpdates(userId, school) {
  const today = new Date();
  const fromYmd = formatYmd(today);
  const toYmd = formatYmd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + WATCH_DAYS));
  const rows = await getSchoolSchedule(school.officeCode, school.code, fromYmd, toYmd);
  const current = { fromYmd, toYmd, events: buildSnapshot(rows) };

  const storageKey = `${STORAGE_PREFIX}:${userId}:${school.officeCode}:${school.code}`;
  const previous = readSnapshot(storageKey);
  if (!previous) {
    saveSnapshot(storageKey, current);
    return [];
  }

  // 지난번과 이번에 둘 다 확인한 기간만 비교 (날짜가 지나며 기간이 밀려서 생기는 가짜 추가/삭제 방지)
  const overlapFrom = previous.fromYmd > fromYmd ? previous.fromYmd : fromYmd;
  const overlapTo = previous.toYmd < toYmd ? previous.toYmd : toYmd;
  const changes = diffSnapshots(previous.events, current.events, overlapFrom, overlapTo);

  // 학사일정이 한꺼번에 전부 사라졌다면 NEIS 쪽 일시적인 문제일 가능성이 커서, 이번 결과는 무시하고 기록도 유지
  const hasCurrentEvents = Object.keys(current.events).some((date) => date >= overlapFrom && date <= overlapTo);
  if (changes.length > 0 && !hasCurrentEvents) return [];

  saveSnapshot(storageKey, current);
  return changes;
}

function formatDate(ymd) {
  const date = new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)));
  return `${date.getMonth() + 1}월 ${date.getDate()}일(${WEEKDAY_NAMES[date.getDay()]})`;
}

/**
 * 바뀐 점 하나를 알림에 보여줄 문장으로 바꿉니다.
 */
export function formatScheduleChange(change) {
  switch (change.type) {
    case "added":
      return `${formatDate(change.date)} ${change.name} 추가`;
    case "removed":
      return `${formatDate(change.date)} ${change.name} 삭제`;
    case "moved":
      return `${change.name} 날짜 변경: ${formatDate(change.fromDate)} → ${formatDate(change.date)}`;
    case "renamed":
      return `${formatDate(change.date)} ${change.oldName} → ${change.name}`;
    default:
      return "";
  }
}
