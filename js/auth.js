// 로그인, 회원가입
import { supabase } from "./config.js";

// 아이디를 가짜 이메일로 바꿔서 Supabase Auth 사용 (Confirm email 꺼둘 것)
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

const DUPLICATE_USERNAME_MESSAGE = "이미 사용 중인 아이디예요. 다른 아이디를 입력해주세요";

function toSignUpErrorMessage(error) {
  if (error.code === "user_already_exists" || /already registered/i.test(error.message || "")) {
    return DUPLICATE_USERNAME_MESSAGE;
  }
  if (error.code === "weak_password") {
    return "비밀번호가 너무 쉬워요. 더 길거나 복잡한 비밀번호를 입력해주세요";
  }
  if (error.status === 429) {
    return "잠시 후 다시 시도해주세요 (요청이 너무 많아요)";
  }
  console.warn("회원가입 오류", error);
  return "회원가입 중 오류가 발생했어요. 잠시 후 다시 시도해주세요";
}

// 회원가입
export async function signUp(username, password) {
  assertValidUsername(username);
  const { data, error } = await supabase.auth.signUp({
    email: usernameToEmail(username),
    password,
    options: { data: { username: username.trim() } },
  });
  if (error) throw new Error(toSignUpErrorMessage(error));
  if (data.user && data.user.identities?.length === 0) throw new Error(DUPLICATE_USERNAME_MESSAGE);
  return data;
}

// 로그인
export async function signIn(username, password) {
  assertValidUsername(username);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  if (error) throw error;
  return data;
}

// 로그아웃
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// 내 학교 저장
export async function updateMySchool(school) {
  const { data, error } = await supabase.auth.updateUser({ data: { school } });
  if (error) throw error;
  return data.user;
}

// 세션 확인
export async function getSessionUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

export function onAuthUserChange(callback) {
  supabase.auth.onAuthStateChange((event, session) => callback(session?.user ?? null));
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    if (error.name === "AuthSessionMissingError") return null;
    throw error;
  }
  return data.user;
}
