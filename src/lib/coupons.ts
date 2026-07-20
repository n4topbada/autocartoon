export const COUPON_CREDITS = 600;
export const COUPON_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const COUPON_CODE_PATTERN = /^WONY-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;

export type CouponAvailability =
  | "available"
  | "inactive"
  | "not_started"
  | "expired"
  | "exhausted";

export type CouponAvailabilityInput = {
  active: boolean;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
  maxRedemptions: number | null;
  redeemedCount: number;
};

export type CouponCampaignInput = {
  title: string;
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
};

export type CouponInputResult =
  | { ok: true; value: CouponCampaignInput }
  | { ok: false; error: string };

function parseOptionalDate(value: unknown): Date | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return "invalid";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "invalid" : date;
}

export function generateCouponCode(randomValues?: Uint32Array) {
  const values = randomValues ?? crypto.getRandomValues(new Uint32Array(8));
  if (values.length < 8) throw new Error("Coupon code generation needs eight random values.");
  const characters = Array.from(values.slice(0, 8), (value) => (
    COUPON_CODE_ALPHABET[value % COUPON_CODE_ALPHABET.length]
  )).join("");
  return `WONY-${characters.slice(0, 4)}-${characters.slice(4)}`;
}

export function normalizeCouponCode(value: unknown): string {
  if (typeof value !== "string") return "";
  let candidate = value.trim();
  if (!candidate) return "";

  if (/^https?:\/\//i.test(candidate) || /^\/?coupon\//i.test(candidate)) {
    try {
      const url = new URL(candidate, "https://coupon.local");
      const segments = url.pathname.split("/").filter(Boolean);
      const couponIndex = segments.findIndex((segment) => segment.toLowerCase() === "coupon");
      candidate = couponIndex >= 0 ? segments[couponIndex + 1] ?? "" : "";
    } catch {
      return "";
    }
  }

  try {
    candidate = decodeURIComponent(candidate);
  } catch {
    return "";
  }
  const normalized = candidate.trim().toUpperCase();
  return COUPON_CODE_PATTERN.test(normalized) ? normalized : "";
}

export function parseCouponCampaignInput(input: unknown): CouponInputResult {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "쿠폰 정보를 입력해주세요." };
  }
  const body = input as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return { ok: false, error: "쿠폰 이름을 입력해주세요." };
  if (title.length > 80) return { ok: false, error: "쿠폰 이름은 80자 이하여야 합니다." };

  const startsAt = parseOptionalDate(body.startsAt);
  const endsAt = parseOptionalDate(body.endsAt);
  if (startsAt === "invalid" || endsAt === "invalid") {
    return { ok: false, error: "쿠폰 사용 기간을 확인해주세요." };
  }
  if (startsAt && endsAt && endsAt <= startsAt) {
    return { ok: false, error: "종료 시각은 시작 시각보다 늦어야 합니다." };
  }

  let maxRedemptions: number | null = null;
  if (body.maxRedemptions !== null && body.maxRedemptions !== undefined && body.maxRedemptions !== "") {
    const parsedMaximum = Number(body.maxRedemptions);
    if (!Number.isSafeInteger(parsedMaximum) || parsedMaximum < 1 || parsedMaximum > 100_000) {
      return { ok: false, error: "최대 지급 인원은 1명에서 100,000명 사이여야 합니다." };
    }
    maxRedemptions = parsedMaximum;
  }

  return {
    ok: true,
    value: {
      title,
      active: body.active !== false,
      startsAt,
      endsAt,
      maxRedemptions,
    },
  };
}

export function getCouponAvailability(
  campaign: CouponAvailabilityInput,
  now = new Date(),
): CouponAvailability {
  if (!campaign.active) return "inactive";
  if (campaign.startsAt && new Date(campaign.startsAt) > now) return "not_started";
  if (campaign.endsAt && new Date(campaign.endsAt) <= now) return "expired";
  if (campaign.maxRedemptions !== null && campaign.redeemedCount >= campaign.maxRedemptions) {
    return "exhausted";
  }
  return "available";
}

export const COUPON_STATUS_MESSAGES: Record<Exclude<CouponAvailability, "available">, string> = {
  inactive: "현재 사용할 수 없는 쿠폰입니다.",
  not_started: "아직 사용 기간이 시작되지 않은 쿠폰입니다.",
  expired: "사용 기간이 종료된 쿠폰입니다.",
  exhausted: "준비된 쿠폰이 모두 지급되었습니다.",
};
