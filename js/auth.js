//아이디/비밀번호 로그인·회원가입 및 세션 (supabase/users.sql 의 sign_up, sign_in 함수 사용)
import { supabase } from "./config.js";

// 로그인 정보를 localStorage 에 저장해서 브라우저를 껐다 켜도 로그인 유지
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
 * 로그인
 * @returns {Promise<{ id, username }>}
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
 * 로그아웃
 */
export function signOut() {
  localStorage.removeItem(SESSION_KEY);
}

/**
 * 현재 로그인한 사용자 (없으면 null)
 * @returns {{ id, username } | null}
 */
export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
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
    JSON.stringify({ id: user.id, username: user.username }),
  );
}
