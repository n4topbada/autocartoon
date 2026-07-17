const ANNOUNCEMENT_CATEGORIES = ["notice", "update", "maintenance"] as const;

export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];

export const ANNOUNCEMENT_CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  notice: "공지",
  update: "업데이트",
  maintenance: "점검",
};

export function parseAnnouncementLimit(value: string | null, fallback = 30) {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

interface AnnouncementInput {
  title: string;
  content: string;
  category: AnnouncementCategory;
  pinned: boolean;
  published: boolean;
  expiresAt: Date | null;
}

type ParseResult =
  | { ok: true; value: AnnouncementInput }
  | { ok: false; error: string };

export function parseAnnouncementInput(input: unknown): ParseResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "공지 내용을 확인해주세요." };
  }

  const body = input as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const category = typeof body.category === "string" ? body.category : "notice";

  if (!title) return { ok: false, error: "제목을 입력해주세요." };
  if (title.length > 120) return { ok: false, error: "제목은 120자 이하여야 합니다." };
  if (!content) return { ok: false, error: "내용을 입력해주세요." };
  if (content.length > 5_000) return { ok: false, error: "내용은 5,000자 이하여야 합니다." };
  if (!ANNOUNCEMENT_CATEGORIES.includes(category as AnnouncementCategory)) {
    return { ok: false, error: "지원하지 않는 공지 분류입니다." };
  }

  let expiresAt: Date | null = null;
  if (body.expiresAt !== null && body.expiresAt !== undefined && body.expiresAt !== "") {
    if (typeof body.expiresAt !== "string") {
      return { ok: false, error: "만료 시각을 확인해주세요." };
    }
    expiresAt = new Date(body.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      return { ok: false, error: "만료 시각을 확인해주세요." };
    }
  }

  return {
    ok: true,
    value: {
      title,
      content,
      category: category as AnnouncementCategory,
      pinned: body.pinned === true,
      published: body.published === true,
      expiresAt,
    },
  };
}
