// 공휴일 (API, 실패하면 직접 계산)
import { HOLIDAY_API_KEY } from "./config.js";

const HOLIDAY_API_URL = "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";

// 양력 공휴일
const SOLAR_HOLIDAYS = [
  { month: 1, day: 1, name: "1월1일", substitute: false },
  { month: 3, day: 1, name: "삼일절", substitute: true },
  { month: 5, day: 1, name: "노동절", substitute: true, since: 2026 },
  { month: 5, day: 5, name: "어린이날", substitute: true },
  { month: 6, day: 6, name: "현충일", substitute: false },
  { month: 7, day: 17, name: "제헌절", substitute: true, since: 2026 },
  { month: 8, day: 15, name: "광복절", substitute: true },
  { month: 10, day: 3, name: "개천절", substitute: true },
  { month: 10, day: 9, name: "한글날", substitute: true },
  { month: 12, day: 25, name: "기독탄신일", substitute: true },
];

// 음력 공휴일
const LUNAR_HOLIDAYS = [
  { month: 1, day: 1, name: "설날", period: true },
  { month: 4, day: 8, name: "부처님오신날", substitute: true },
  { month: 8, day: 15, name: "추석", period: true },
];

const lunarFormat = new Intl.DateTimeFormat("en-u-ca-dangi", { month: "numeric", day: "numeric" });

const apiHolidaysByYear = {};
const computedHolidaysByYear = {};
const requestedYears = new Set();

// 공휴일 API 연결
export async function loadHolidays(year) {
  if (!HOLIDAY_API_KEY || requestedYears.has(year)) return false;
  requestedYears.add(year);

  try {
    const holidays = await fetchRestDays(year);
    if (Object.keys(holidays).length === 0) return false;
    apiHolidaysByYear[year] = holidays;
    return true;
  } catch (err) {
    console.warn(`${year}년 공휴일을 API에서 불러오지 못해 계산한 공휴일로 표시합니다.`, err);
    return false;
  }
}

async function fetchRestDays(year) {
  const serviceKey = HOLIDAY_API_KEY.includes("%") ? HOLIDAY_API_KEY : encodeURIComponent(HOLIDAY_API_KEY);
  const url = `${HOLIDAY_API_URL}?serviceKey=${serviceKey}&solYear=${year}&numOfRows=100&_type=json`;
  const res = await fetch(url);
  const data = await res.json();

  const header = data?.response?.header;
  if (!res.ok || header?.resultCode !== "00") {
    const reason =
      header?.resultMsg || data?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnAuthMsg || `HTTP ${res.status}`;
    throw new Error(`공휴일 API 오류: ${reason}`);
  }

  let items = data.response.body?.items?.item || [];
  if (!Array.isArray(items)) items = [items];

  return items.reduce((acc, item) => {
    if (item.isHoliday !== "Y") return acc;
    const ymd = String(item.locdate);
    const dateKey = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
    acc[dateKey] = acc[dateKey] ? `${acc[dateKey]}・${item.dateName}` : item.dateName;
    return acc;
  }, {});
}

function toDateKey(date) {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isWeekend(date) {
  return date.getDay() === 0 || date.getDay() === 6;
}

function lunarToSolar(year, lunarMonth, lunarDay) {
  for (let date = new Date(year, 0, 1, 12); date.getFullYear() === year; date = addDays(date, 1)) {
    const parts = lunarFormat.formatToParts(date);
    const month = parts.find((p) => p.type === "month").value;
    const day = parts.find((p) => p.type === "day").value;
    if (month === String(lunarMonth) && day === String(lunarDay)) return date;
  }
  return null;
}

// 공휴일 직접 계산
function computeHolidays(year) {
  const list = [];
  const periods = [];

  SOLAR_HOLIDAYS.forEach((h) => {
    if (h.since && year < h.since) return;
    list.push({ date: new Date(year, h.month - 1, h.day, 12), name: h.name, substitute: h.substitute });
  });

  const supportsLunar = lunarFormat.resolvedOptions().calendar === "dangi";
  LUNAR_HOLIDAYS.forEach((h) => {
    const date = supportsLunar ? lunarToSolar(year, h.month, h.day) : null;
    if (!date) return;
    if (h.period) {
      const days = [-1, 0, 1].map((offset) => ({ date: addDays(date, offset), name: h.name, substitute: false }));
      list.push(...days);
      periods.push({ name: h.name, days });
    } else {
      list.push({ date, name: h.name, substitute: h.substitute });
    }
  });

  const holidays = {};
  list.forEach((h) => {
    const key = toDateKey(h.date);
    if (holidays[key]) h.displaced = true;
    holidays[key] = holidays[key] ? `${holidays[key]}・${h.name}` : h.name;
  });

  const substitutes = [];
  periods.forEach((p) => {
    if (p.days.some((h) => h.date.getDay() === 0 || h.displaced)) {
      substitutes.push({ after: p.days[p.days.length - 1].date, name: `대체공휴일(${p.name})` });
    }
  });
  list.forEach((h) => {
    if (h.substitute && (isWeekend(h.date) || h.displaced)) {
      substitutes.push({ after: h.date, name: `대체공휴일(${h.name})` });
    }
  });

  substitutes
    .sort((a, b) => a.after - b.after)
    .forEach((s) => {
      let date = addDays(s.after, 1);
      while (isWeekend(date) || holidays[toDateKey(date)]) date = addDays(date, 1);
      holidays[toDateKey(date)] = s.name;
    });

  return holidays;
}

export function getHolidayName(dateKey) {
  const year = Number(dateKey.slice(0, 4));
  if (!apiHolidaysByYear[year] && !computedHolidaysByYear[year]) {
    computedHolidaysByYear[year] = computeHolidays(year);
  }
  const holidays = apiHolidaysByYear[year] || computedHolidaysByYear[year];
  return holidays[dateKey] || null;
}

export function isSunday(date) {
  return date.getDay() === 0;
}

export function isSaturday(date) {
  return date.getDay() === 6;
}
