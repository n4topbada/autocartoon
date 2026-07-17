export type AuthMethod = "password" | "google" | "kakao";

export function canManageAccountWithoutPassword(
  authMethod: AuthMethod | undefined,
  passwordlessKakaoAccount: boolean
): boolean {
  return (
    passwordlessKakaoAccount || authMethod === "google" || authMethod === "kakao"
  );
}
