import {
  getCreditProduct,
  getProductTotalCredits,
} from "./credit-products";

export const ADMIN_CREDIT_GRANT_MAX = 1_000_000;

export interface AdminCreditGrant {
  amount: number;
  mode: "preset" | "custom";
  productCode: string | null;
  note: string;
}

export type AdminCreditGrantResult =
  | { ok: true; grant: AdminCreditGrant }
  | { ok: false; error: string };

export function parseAdminCreditGrant(
  input: Record<string, unknown>
): AdminCreditGrantResult {
  const hasPreset = input.creditProductCode !== undefined;
  const hasCustomAmount = input.addCredits !== undefined;

  if (hasPreset && hasCustomAmount) {
    return { ok: false, error: "상품 프리셋과 직접 입력은 동시에 사용할 수 없습니다." };
  }

  if (hasPreset) {
    if (typeof input.creditProductCode !== "string") {
      return { ok: false, error: "올바른 크레딧 상품을 선택해주세요." };
    }

    const product = getCreditProduct(input.creditProductCode);
    if (!product) {
      return { ok: false, error: "존재하지 않는 크레딧 상품입니다." };
    }

    const amount = getProductTotalCredits(product);
    return {
      ok: true,
      grant: {
        amount,
        mode: "preset",
        productCode: product.code,
        note: `관리자 수동 지급: ${product.name} ${product.amountKrw.toLocaleString("ko-KR")}원 상품 기준`,
      },
    };
  }

  const amount = Number(input.addCredits);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > ADMIN_CREDIT_GRANT_MAX) {
    return {
      ok: false,
      error: `크레딧은 1에서 ${ADMIN_CREDIT_GRANT_MAX.toLocaleString("ko-KR")} 사이의 정수여야 합니다.`,
    };
  }

  return {
    ok: true,
    grant: {
      amount,
      mode: "custom",
      productCode: null,
      note: "관리자 수동 지급: 직접 입력",
    },
  };
}
