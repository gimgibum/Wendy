//Supabase client 설정 & NEIS API key 상수 정의

const SUPABASE_URL = "https://dmkvbvzukqtfiwyyphtl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_nFz7j6nrEGchxMVp-CBh1Q_XuQsKpw4";

// Supabase 클라이언트 생성
export const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);

// NEIS API 인증키
export const NEIS_API_KEY = "86095495716846249395b771112a109d";

// 공공데이터포털 "한국천문연구원_특일 정보" 인증키 (공휴일 표시용)
// 비워두면 API 대신 holidays.js 의 기본 공휴일 데이터로 표시됩니다.
export const HOLIDAY_API_KEY =
  "d168977e00187899eab3fe76b6d6f9223ea9b6ecc683de17dd10c298bdef9901";
