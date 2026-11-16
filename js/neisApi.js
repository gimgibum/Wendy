// NEIS API 연결
import { NEIS_API_KEY } from "./config.js";

const BASE_URL = "https://open.neis.go.kr/hub";

// 학교 검색
export async function searchSchools(keyword) {
  const url = `${BASE_URL}/schoolInfo?KEY=${NEIS_API_KEY}&Type=json&pIndex=1&pSize=20&SCHUL_NM=${encodeURIComponent(keyword)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("학교 검색 요청이 실패했습니다");
  const data = await res.json();

  const rows = data?.schoolInfo?.[1]?.row;
  if (!rows) return [];

  return rows.map((row) => ({
    name: row.SCHUL_NM,
    code: row.SD_SCHUL_CODE,
    officeCode: row.ATPT_OFCDC_SC_CODE,
    region: row.ORG_RDNMA,
  }));
}

// 학사일정 조회
export async function getSchoolSchedule(officeCode, schoolCode, fromYmd, toYmd) {
  const url = `${BASE_URL}/SchoolSchedule?KEY=${NEIS_API_KEY}&Type=json&pIndex=1&pSize=1000&ATPT_OFCDC_SC_CODE=${officeCode}&SD_SCHUL_CODE=${schoolCode}&AA_FROM_YMD=${fromYmd}&AA_TO_YMD=${toYmd}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("학사일정 요청이 실패했습니다");
  const data = await res.json();

  // 에러 코드는 0건으로 처리하지 않고 에러로
  const resultCode = data?.RESULT?.CODE;
  if (resultCode && resultCode !== "INFO-200") {
    throw new Error(data.RESULT.MESSAGE || "학사일정 요청이 실패했습니다");
  }

  const rows = data?.SchoolSchedule?.[1]?.row;
  if (!rows) return [];

  return rows.map((row) => ({
    date: row.AA_YMD,
    eventName: row.EVENT_NM,
    schoolName: row.SCHUL_NM,
    dayType: row.SBTR_DD_SC_NM,
  }));
}
