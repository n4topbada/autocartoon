export const CHARACTER_DESIGNER_EMAIL = "wony@wonyframe.com";

export interface CharacterDesignerAccessUser {
  email?: string | null;
  role?: string | null;
}

export function canAccessCharacterDesigner(
  user: CharacterDesignerAccessUser | null | undefined
): boolean {
  if (!user) return false;
  return (
    user.role === "admin" ||
    user.email?.trim().toLowerCase() === CHARACTER_DESIGNER_EMAIL
  );
}
