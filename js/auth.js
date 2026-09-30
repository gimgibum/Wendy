//아이디/비밀번호 로그인·회원가입 및 세션 (supabase/users.sql 의 sign_up, sign_in, sign_out 함수 사용)
import { supabase } from "./config.js";

// 로그인 정보(세션 토큰 포함)를 localStorage 에 저장해서 브라우저를 껐다 켜도 로그인 유지
const SESSION_KEY = "wendy_user";

/**
 * 회원가입 (로그인 상태로 만들지는 않음 → 로그인 화면에서 다시 로그인해야 함)
 * @returns {Promise<{ id, username }>}
 */
export async function signUp(username, password) {
  const { data, error } = await supabase.rpc("sign_up", {
    p_username: username,
    p_password: password,
  });

  if (error) {
    if (error.code === "23505") throw new Error("이미 사용 중인 아이디예요");
    throw error;
  }

  return data[0];
}

/**
 * 로그인 (성공하면 세션 토큰을 발급받아 저장)
 * @returns {Promise<{ id, username, token }>}
 */
export async function signIn(username, password) {
  const { data, error } = await supabase.rpc("sign_in", {
    p_username: username,
    p_password: password,
  });

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("아이디 또는 비밀번호가 올바르지 않아요");
  }

  saveSession(data[0]);
  return data[0];
}

/**
 * 로그아웃 (서버의 세션 토큰도 지움)
 */
export async function signOut() {
  const token = getSessionToken();

  localStorage.removeItem(SESSION_KEY);
  // 다음에 로그인하는 사람에게 이전 사람의 학교 일정이 보이지 않도록 정리
  sessionStorage.removeItem("selectedSchool");
  sessionStorage.removeItem("schoolEvents");

  // 서버 세션 삭제는 실패해도 괜찮음 (이 브라우저에서는 이미 로그아웃됨)
  if (token) await supabase.rpc("sign_out", { p_token: token });
}

/**
 * 현재 로그인한 사용자 (없으면 null)
 * @returns {{ id, username, token } | null}
 */
export function getCurrentUser() {
  try {
    const user = JSON.parse(localStorage.getItem(SESSION_KEY));
    // 토큰이 없는 예전 형식의 로그인 정보는 로그아웃 상태로 취급 → 다시 로그인
    return user?.token ? user : null;
  } catch {
    return null;
  }
}

/**
 * DB 함수 호출 시 함께 보낼 세션 토큰 (로그인 안 했으면 null)
 */
export function getSessionToken() {
  return getCurrentUser()?.token ?? null;
}

/**
 * 로그인하지 않았으면 로그인 페이지로 보냄 (로그인 후에만 볼 수 있는 페이지에서 호출)
 */
export function requireLogin() {
  const user = getCurrentUser();
  if (!user) window.location.replace("index.html");
  return user;
}

function saveSession(user) {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ id: user.id, username: user.username, token: user.token }),
  );
}
