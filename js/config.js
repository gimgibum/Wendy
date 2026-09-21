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
