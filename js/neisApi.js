//NEIS 오픈 API 연동 (학교 검색 및 학사일정 fetch)
import { NEIS_API_KEY } from "./config.js";

const NEIS_BASE_URL = "https://open.neis.go.kr/hub";

// 매주 토요일마다 들어오는 일정이라 캘린더에서는 제외
const EXCLUDED_EVENT_NAMES = ["토요휴업일"];

/**
 * NEIS API 호출 후 row 배열만 꺼내서 반환 (데이터 없으면 빈 배열)
 */
async function fetchNeisRows(service, params) {
  const query = new URLSearchParams({
    KEY: NEIS_API_KEY,
    Type: "json",
    pIndex: "1",
    pSize: "1000",
    ...params,
  });

  const res = await fetch(`${NEIS_BASE_URL}/${service}?${query}`);
  if (!res.ok) throw new Error(`NEIS API 요청 실패 (${res.status})`);

  const json = await res.json();

  // 결과가 없으면 { RESULT: { CODE: "INFO-200" } } 형태로 응답
  if (json.RESULT) {
    if (json.RESULT.CODE === "INFO-200") return [];
    throw new Error(json.RESULT.MESSAGE);
  }

  // 정상 응답: { [service]: [{ head }, { row }] }
  return json[service]?.[1]?.row || [];
}

/**
 * 학교 이름으로 학교 검색
 * @returns {Promise<Array>} [{ name, code, officeCode, officeName, address }]
 */
export async function searchSchools(keyword) {
  const rows = await fetchNeisRows("schoolInfo", { SCHUL_NM: keyword });

  return rows.map((row) => ({
    name: row.SCHUL_NM,
    code: row.SD_SCHUL_CODE,
    officeCode: row.ATPT_OFCDC_SC_CODE,
    officeName: row.ATPT_OFCDC_SC_NM,
    address: row.ORG_RDNMA,
  }));
}

/**
 * 학교 학사일정 조회
 * @param {string} fromYmd - 'YYYYMMDD'
 * @param {string} toYmd - 'YYYYMMDD'
 * @returns {Promise<Array>} [{ date: 'YYYYMMDD', eventName }]
 */
export async function getSchoolSchedule(officeCode, schoolCode, fromYmd, toYmd) {
  const rows = await fetchNeisRows("SchoolSchedule", {
    ATPT_OFCDC_SC_CODE: officeCode,
    SD_SCHUL_CODE: schoolCode,
    AA_FROM_YMD: fromYmd,
    AA_TO_YMD: toYmd,
  });

  return rows
    .filter((row) => !EXCLUDED_EVENT_NAMES.includes(row.EVENT_NM))
    .map((row) => ({
      date: row.AA_YMD,
      eventName: row.EVENT_NM,
    }));
}
