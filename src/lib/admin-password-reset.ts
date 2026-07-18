import { isLegacyPasswordAccount, type AccountProviders } from "./account-auth";

export const ADMIN_TEMPORARY_PASSWORD_LENGTH = 12;
export const ADMIN_TEMPORARY_PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
export const ADMIN_TEMPORARY_PASSWORD_EXPIRIES = [30, 120, 1440] as const;

export function validateAdminTemporaryPassword(value: unknown): string | null {
  if (typeof value !== "string") {
    return "임시 비밀번호를 입력해주세요.";
  }
  if (value.length !== ADMIN_TEMPORARY_PASSWORD_LENGTH) {
    return `임시 비밀번호는 ${ADMIN_TEMPORARY_PASSWORD_LENGTH}자여야 합니다.`;
  }
  if (!/^[A-Za-z0-9]+$/.test(value)) {
    return "임시 비밀번호는 영문과 숫자만 사용할 수 있습니다.";
  }
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    return "임시 비밀번호에는 영문과 숫자가 각각 하나 이상 필요합니다.";
  }
  return null;
}

export function normalizeAdminPasswordExpiry(value: unknown): number | null {
  const minutes = Number(value);
  return ADMIN_TEMPORARY_PASSWORD_EXPIRIES.includes(
    minutes as (typeof ADMIN_TEMPORARY_PASSWORD_EXPIRIES)[number]
  )
    ? minutes
    : null;
}

export function canAdminResetPassword(
  account: AccountProviders & { email: string }
): boolean {
  const email = account.email.toLowerCase();
  return (
    isLegacyPasswordAccount(account) &&
    !email.endsWith("@oauth.wonyframe.local") &&
    !email.endsWith("@deleted.invalid")
  );
}
