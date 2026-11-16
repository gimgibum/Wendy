// 학사일정 변경 감지 (localStorage 저장본과 비교)
import { getSchoolSchedule } from "./neisApi.js";

const WATCH_DAYS = 180;
const STORAGE_PREFIX = "wendy:schoolSnapshot";
const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

function formatYmd(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

export function buildSnapshot(rows) {
  return rows.reduce((acc, row) => {
    if (row.eventName === "토요휴업일" || row.dayType === "공휴일") return acc;
    if (!acc[row.date]) acc[row.date] = [];
    acc[row.date].push(row.eventName);
    return acc;
  }, {});
}

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

// 변경 비교
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
  takePairs(removed, added, (r, a) => r.name === a.name).forEach(([r, a]) => {
    changes.push({ type: "moved", date: a.date, name: a.name, fromDate: r.date });
  });
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
  }
}

// 학사일정 변경 확인
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

  const overlapFrom = previous.fromYmd > fromYmd ? previous.fromYmd : fromYmd;
  const overlapTo = previous.toYmd < toYmd ? previous.toYmd : toYmd;
  const changes = diffSnapshots(previous.events, current.events, overlapFrom, overlapTo);

  const hasCurrentEvents = Object.keys(current.events).some((date) => date >= overlapFrom && date <= overlapTo);
  if (changes.length > 0 && !hasCurrentEvents) return [];

  saveSnapshot(storageKey, current);
  return changes;
}

function formatDate(ymd) {
  const date = new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)));
  return `${date.getMonth() + 1}월 ${date.getDate()}일(${WEEKDAY_NAMES[date.getDay()]})`;
}

// 알림 문구
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
