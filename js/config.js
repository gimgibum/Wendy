// Supabase, API 키 설정
const SUPABASE_URL = "https://dmkvbvzukqtfiwyyphtl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_nFz7j6nrEGchxMVp-CBh1Q_XuQsKpw4";

// Supabase 연결
export const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);

// NEIS API 키
export const NEIS_API_KEY = "86095495716846249395b771112a109d";

// 공휴일 API 키 (비우면 내장 데이터 사용)
export const HOLIDAY_API_KEY =
  "d168977e00187899eab3fe76b6d6f9223ea9b6ecc683de17dd10c298bdef9901";
