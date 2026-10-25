// 대한민국 공휴일/휴일 데이터
// - 공공데이터포털 "한국천문연구원_특일 정보" API(getRestDeInfo)에서 연도별 휴일을 받아와 표시합니다.
//   선거일·임시공휴일까지 들어 있는 공식 데이터지만, 천문연구원이 발표한 연도(보통 2~3년 뒤)까지만 있습니다.
// - API 키가 없거나, 요청이 실패했거나, 아직 발표되지 않은 연도(0건)는 공휴일 규칙으로 직접 계산해서 표시합니다.
//   (양력 공휴일 + 음력 설날·추석·부처님오신날 + 대체공휴일. 선거일·임시공휴일은 미리 알 수 없어 빠집니다)
import { HOLIDAY_API_KEY } from "./config.js";

const HOLIDAY_API_URL = "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";

// 양력 공휴일 - substitute: 토·일요일이나 다른 공휴일과 겹치면 대체공휴일이 생기는 공휴일
// (이름은 API에서 오는 이름과 맞춤)
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

// 음력 공휴일 - period: 전날·당일·다음날 3일 연휴 (일요일이나 다른 공휴일과 겹칠 때만 대체공휴일)
const LUNAR_HOLIDAYS = [
  { month: 1, day: 1, name: "설날", period: true },
  { month: 4, day: 8, name: "부처님오신날", substitute: true },
  { month: 8, day: 15, name: "추석", period: true },
];

// 양력 날짜를 한국 음력(단기력) 월/일로 바꿔주는 브라우저 내장 포맷터
const lunarFormat = new Intl.DateTimeFormat("en-u-ca-dangi", { month: "numeric", day: "numeric" });

// API에서 받아온 연도별 휴일 - { 2026: { "2026-10-09": "한글날", ... } }
const apiHolidaysByYear = {};
// 규칙으로 계산한 연도별 휴일 (한 번 계산하면 재사용)
const computedHolidaysByYear = {};
// 이미 요청을 보낸 연도 (같은 연도를 여러 번 요청하지 않도록)
const requestedYears = new Set();

/**
 * 해당 연도의 휴일을 API에서 받아옵니다.
 * 이번 호출로 새로 받아왔으면 true, 이미 요청했거나 키가 없거나 실패하면 false를 반환합니다.
 * (true일 때만 달력을 다시 그리면 됩니다)
 */
export async function loadHolidays(year) {
  if (!HOLIDAY_API_KEY || requestedYears.has(year)) return false;
  requestedYears.add(year);

  try {
    const holidays = await fetchRestDays(year);
    // 천문연구원이 아직 발표하지 않은 연도는 0건이 오므로, 계산한 공휴일을 그대로 씀
    if (Object.keys(holidays).length === 0) return false;
    apiHolidaysByYear[year] = holidays;
    return true;
  } catch (err) {
    console.warn(`${year}년 공휴일을 API에서 불러오지 못해 계산한 공휴일로 표시합니다.`, err);
    return false;
  }
}

async function fetchRestDays(year) {
  // 포털의 Encoding 키(이미 %로 인코딩됨)와 Decoding 키 중 어느 쪽을 넣어도 동작하도록 처리
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
  if (!Array.isArray(items)) items = [items]; // 결과가 1건이면 배열이 아니라 객체로 옴

  return items.reduce((acc, item) => {
    if (item.isHoliday !== "Y") return acc;
    const ymd = String(item.locdate);
    const dateKey = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
    // 어린이날과 부처님오신날처럼 같은 날 휴일이 겹치면 이름을 이어 붙임
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

/**
 * 음력 월/일이 양력으로 그 해 몇 월 며칠인지 찾습니다. (윤달은 제외)
 */
function lunarToSolar(year, lunarMonth, lunarDay) {
  for (let date = new Date(year, 0, 1, 12); date.getFullYear() === year; date = addDays(date, 1)) {
    const parts = lunarFormat.formatToParts(date);
    // 윤달은 month 값이 "4bis"처럼 나오므로 문자열 비교로 자연스럽게 제외됨
    const month = parts.find((p) => p.type === "month").value;
    const day = parts.find((p) => p.type === "day").value;
    if (month === String(lunarMonth) && day === String(lunarDay)) return date;
  }
  return null;
}

/**
 * 공휴일 규칙(공휴일에 관한 법률, 관공서의 공휴일에 관한 규정)으로 해당 연도의 휴일을 계산합니다.
 * - 설날·추석 연휴: 일요일이나 다른 공휴일과 겹치면 연휴 다음 첫 평일이 대체공휴일
 * - 대체 대상 공휴일: 토·일요일이나 다른 공휴일과 겹치면 다음 첫 평일이 대체공휴일
 * - 같은 날 공휴일이 겹치면 먼저 넣은 공휴일이 그날을 차지하고, 나머지가 대체공휴일을 받음
 */
function computeHolidays(year) {
  const list = []; // { date, name, substitute, displaced }
  const periods = []; // { name, days: [list 항목] }

  SOLAR_HOLIDAYS.forEach((h) => {
    if (h.since && year < h.since) return;
    list.push({ date: new Date(year, h.month - 1, h.day, 12), name: h.name, substitute: h.substitute });
  });

  // 이 브라우저가 음력(단기력)을 지원하지 않으면 음력 공휴일은 건너뜀
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

  const substitutes = []; // { after: 이 날짜 다음부터 찾음, name }
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

/**
 * 주어진 날짜(YYYY-MM-DD)가 공휴일이면 이름을, 아니면 null을 반환합니다.
 */
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
