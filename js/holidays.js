// 대한민국 공휴일/휴일 데이터
// - 공공데이터포털 "한국천문연구원_특일 정보" API(getRestDeInfo)에서 연도별 휴일을 받아와 표시합니다.
//   설날/추석/부처님오신날, 대체공휴일, 임시공휴일, 선거일까지 포함되어 있어 매년 직접 채울 필요가 없습니다.
// - API 키(config.js 의 HOLIDAY_API_KEY)가 없거나 요청이 실패한 연도는
//   아래 FIXED_HOLIDAYS / YEAR_SPECIFIC_HOLIDAYS 기본 데이터로 표시합니다.
import { HOLIDAY_API_KEY } from "./config.js";

const HOLIDAY_API_URL = "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";

const FIXED_HOLIDAYS = [
  { month: 1, day: 1, name: "신정" },
  { month: 3, day: 1, name: "삼일절" },
  { month: 5, day: 5, name: "어린이날" },
  { month: 6, day: 6, name: "현충일" },
  { month: 8, day: 15, name: "광복절" },
  { month: 10, day: 3, name: "개천절" },
  { month: 10, day: 9, name: "한글날" },
  { month: 12, day: 25, name: "크리스마스" },
];

const YEAR_SPECIFIC_HOLIDAYS = {
  2025: {
    "2025-01-28": "설날 연휴",
    "2025-01-29": "설날",
    "2025-01-30": "설날 연휴",
    "2025-03-03": "대체공휴일(삼일절)",
    "2025-05-05": "어린이날・부처님오신날",
    "2025-05-06": "대체공휴일",
    "2025-10-05": "추석 연휴",
    "2025-10-06": "추석",
    "2025-10-07": "추석 연휴",
    "2025-10-08": "대체공휴일(추석)",
  },
  2026: {
    "2026-02-16": "설날 연휴",
    "2026-02-17": "설날",
    "2026-02-18": "설날 연휴",
    "2026-03-02": "대체공휴일(삼일절)",
    "2026-05-24": "부처님오신날",
    "2026-05-25": "대체공휴일",
    "2026-08-17": "대체공휴일(광복절)",
    "2026-09-24": "추석 연휴",
    "2026-09-25": "추석",
    "2026-09-26": "추석 연휴",
    "2026-09-28": "대체공휴일(추석)",
    "2026-10-05": "대체공휴일(개천절)",
  },
};

// API에서 받아온 연도별 휴일 - { 2026: { "2026-10-09": "한글날", ... } }
const apiHolidaysByYear = {};
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
    apiHolidaysByYear[year] = await fetchRestDays(year);
    return true;
  } catch (err) {
    console.warn(`${year}년 공휴일을 API에서 불러오지 못해 기본 데이터로 표시합니다.`, err);
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

/**
 * 주어진 날짜(YYYY-MM-DD)가 공휴일이면 이름을, 아니면 null을 반환합니다.
 */
export function getHolidayName(dateKey) {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));
  const day = Number(dateKey.slice(8, 10));

  const apiMap = apiHolidaysByYear[year];
  if (apiMap) return apiMap[dateKey] || null;

  const yearMap = YEAR_SPECIFIC_HOLIDAYS[year];
  if (yearMap && yearMap[dateKey]) return yearMap[dateKey];

  const fixed = FIXED_HOLIDAYS.find((h) => h.month === month && h.day === day);
  return fixed ? fixed.name : null;
}

export function isSunday(date) {
  return date.getDay() === 0;
}

export function isSaturday(date) {
  return date.getDay() === 6;
}
