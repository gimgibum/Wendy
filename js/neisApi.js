//NEIS 오픈 API 연동 (학교 검색 및 학사일정 fetch)
import { NEIS_API_KEY } from "./config.js";

const BASE_URL = "https://open.neis.go.kr/hub";

/**
 * 학교 이름으로 학교를 검색합니다.
 * @param {string} keyword
 * @returns {Promise<Array<{name: string, code: string, officeCode: string, region: string}>>}
 */
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

/**
 * 학교의 학사일정을 조회합니다.
 * @param {string} officeCode - 시도교육청코드
 * @param {string} schoolCode - 학교코드
 * @param {string} fromYmd - 조회 시작일 (YYYYMMDD)
 * @param {string} toYmd - 조회 종료일 (YYYYMMDD)
 * @returns {Promise<Array<{date: string, eventName: string, schoolName: string, dayType: string}>>}
 *   dayType은 수업공제일명 ("공휴일", "휴업일", "해당없음" 등)
 */
export async function getSchoolSchedule(officeCode, schoolCode, fromYmd, toYmd) {
  // pSize는 NEIS 최대값(1000) - 몇 달치를 한 번에 받아도 잘리지 않도록
  const url = `${BASE_URL}/SchoolSchedule?KEY=${NEIS_API_KEY}&Type=json&pIndex=1&pSize=1000&ATPT_OFCDC_SC_CODE=${officeCode}&SD_SCHUL_CODE=${schoolCode}&AA_FROM_YMD=${fromYmd}&AA_TO_YMD=${toYmd}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("학사일정 요청이 실패했습니다");
  const data = await res.json();

  // 데이터가 없으면 INFO-200, 인증키 오류 등은 ERROR-xxx 코드가 RESULT로 옴
  // (오류를 "일정 0건"으로 처리하면 학사일정 변경 알림에서 전부 삭제된 것처럼 보이므로 에러로 던짐)
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
