export type AuthMethod = "password" | "google" | "kakao";

export interface AccountProviders {
  kakaoId?: string | null;
  googleId?: string | null;
}

export function hasOAuthIdentity(account: AccountProviders): boolean {
  return Boolean(account.kakaoId || account.googleId);
}

export function isLegacyPasswordAccount(account: AccountProviders): boolean {
  return !hasOAuthIdentity(account);
}

export function canManageAccountWithoutPassword(
  authMethod: AuthMethod | undefined,
  hasLinkedOAuthIdentity: boolean
): boolean {
  return (
    hasLinkedOAuthIdentity || authMethod === "google" || authMethod === "kakao"
  );
}
