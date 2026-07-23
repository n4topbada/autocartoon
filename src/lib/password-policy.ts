export const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;
const SPECIAL_CHARACTER_PATTERN = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;

export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string") {
    return "비밀번호를 입력해주세요.";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`;
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    return "비밀번호가 너무 깁니다.";
  }
  if (!SPECIAL_CHARACTER_PATTERN.test(password)) {
    return "비밀번호에는 특수문자를 1개 이상 포함해야 합니다.";
  }
  return null;
}
