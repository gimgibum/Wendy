// 대한민국 법정공휴일 데이터
// - 양력 고정 공휴일은 아래 FIXED_HOLIDAYS 로 모든 연도에 자동 적용됩니다.
// - 설날/추석/부처님오신날처럼 음력 기준으로 날짜가 매년 바뀌는 공휴일과,
//   공휴일이 주말과 겹칠 때 생기는 대체공휴일은 음력 변환이 필요해 자동 계산할 수 없으므로
//   YEAR_SPECIFIC_HOLIDAYS 에 연도별로 직접 채워둡니다.
// - 목록에 없는 연도(2027년 이후 등)는 양력 고정 공휴일만 표시되니, 매년 정부 발표에 맞춰
//   YEAR_SPECIFIC_HOLIDAYS 에 항목을 추가해주세요.

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

/**
 * 주어진 날짜(YYYY-MM-DD)가 공휴일이면 이름을, 아니면 null을 반환합니다.
 */
export function getHolidayName(dateKey) {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));
  const day = Number(dateKey.slice(8, 10));

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
