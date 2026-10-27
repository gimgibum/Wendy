//Supabase Auth 관련 함수 (로그인/회원가입/로그아웃/세션)
// Supabase 기본 Auth는 이메일 형식을 요구하지만, 이 앱의 로그인 방식은 "아이디 + 비밀번호"라서
// 아이디를 내부적으로 가짜 이메일(아이디@FAKE_EMAIL_DOMAIN)로 변환해서 사용한다.
// ⚠️ Supabase 프로젝트의 Authentication > Providers > Email에서 "Confirm email"을
//    반드시 꺼둬야 한다 (가짜 주소라 확인 메일을 받을 방법이 없음).
import { supabase } from "./config.js";

const FAKE_EMAIL_DOMAIN = "wendy.internal";
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,20}$/;

function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${FAKE_EMAIL_DOMAIN}`;
}

function assertValidUsername(username) {
  if (!USERNAME_PATTERN.test(username.trim())) {
    throw new Error("아이디는 영문, 숫자, ., _, - 조합으로 3~20자여야 해요");
  }
}

/**
 * 아이디/비밀번호로 회원가입합니다.
 * @returns {Promise<{user: object|null, session: object|null}>}
 */
export async function signUp(username, password) {
  assertValidUsername(username);
  const { data, error } = await supabase.auth.signUp({
    email: usernameToEmail(username),
    password,
    options: { data: { username: username.trim() } },
  });
  if (error) throw error;
  return data;
}

/**
 * 아이디/비밀번호로 로그인합니다.
 * @returns {Promise<{user: object, session: object}>}
 */
export async function signIn(username, password) {
  assertValidUsername(username);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  if (error) throw error;
  return data;
}

/**
 * 로그아웃하고 세션을 정리합니다.
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * 내 학교 정보를 계정에 저장합니다 (온보딩 이후 메뉴에서 학교를 바꿀 때).
 * @param {{name: string, code: string, officeCode: string, region: string}} school
 * @returns {Promise<object>} 학교 정보가 반영된 유저
 */
export async function updateMySchool(school) {
  const { data, error } = await supabase.auth.updateUser({ data: { school } });
  if (error) throw error;
  return data.user;
}

/**
 * 이 브라우저에 지금 로그인된 유저를 서버에 묻지 않고 저장된 세션에서 바로 반환합니다. 없으면 null.
 * (같은 브라우저의 다른 탭에서 다른 계정으로 로그인하면 세션이 공유돼서 이 값도 바뀜)
 */
export async function getSessionUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

/**
 * 로그인한 계정이 바뀌거나 로그아웃되면 알려줍니다 (같은 브라우저의 다른 탭에서 바꾼 경우 포함).
 * @param {(user: object|null) => void} callback
 */
export function onAuthUserChange(callback) {
  supabase.auth.onAuthStateChange((event, session) => callback(session?.user ?? null));
}

/**
 * 현재 로그인된 유저를 반환합니다. 로그인 상태가 아니면 null.
 */
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    // 로그인 세션이 없는 것은 정상적인 상태(비로그인)이지 오류가 아니므로 null 반환
    if (error.name === "AuthSessionMissingError") return null;
    throw error;
  }
  return data.user;
}
