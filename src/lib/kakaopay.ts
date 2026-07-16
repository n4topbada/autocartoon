const KAKAOPAY_API_URL = "https://open-api.kakaopay.com/online/v1/payment";
const KAKAOPAY_TIMEOUT_MS = 15_000;

type KakaoPayReadyInput = {
  partnerOrderId: string;
  partnerUserId: string;
  itemName: string;
  itemCode: string;
  amountKrw: number;
  approvalUrl: string;
  cancelUrl: string;
  failUrl: string;
};

export type KakaoPayReadyResult = {
  tid: string;
  next_redirect_app_url: string;
  next_redirect_mobile_url: string;
  next_redirect_pc_url: string;
  android_app_scheme?: string;
  ios_app_scheme?: string;
  created_at: string;
};

export type KakaoPayApprovalResult = {
  aid: string;
  tid: string;
  cid: string;
  partner_order_id: string;
  partner_user_id: string;
  payment_method_type: string;
  item_name: string;
  quantity: number;
  amount: {
    total: number;
    tax_free: number;
    vat?: number;
    point?: number;
    discount?: number;
  };
  approved_at: string;
};

export type KakaoPayOrderResult = {
  tid: string;
  cid: string;
  status: string;
  partner_order_id: string;
  partner_user_id: string;
  payment_method_type?: string;
  item_name: string;
  item_code?: string;
  quantity: number;
  amount: {
    total: number;
    tax_free: number;
    vat?: number;
    point?: number;
    discount?: number;
  };
  approved_at?: string;
  canceled_at?: string;
  payment_action_details?: Array<{
    aid: string;
    approved_at: string;
    amount: number;
    payment_action_type: "PAYMENT" | "CANCEL" | "ISSUED_SID";
    payment_method_type?: string;
  }>;
};

export class KakaoPayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KakaoPayError";
  }
}

function getConfig() {
  return {
    secretKey: process.env.KAKAOPAY_SECRET_KEY?.trim() ?? "",
    cid: process.env.KAKAOPAY_CID?.trim() || "TC0ONETIME",
  };
}

export function isKakaoPayConfigured() {
  return Boolean(getConfig().secretKey);
}

export function isKakaoPayTestMode() {
  return getConfig().cid === "TC0ONETIME";
}

async function kakaoPayRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const config = getConfig();
  if (!config.secretKey) throw new KakaoPayError("카카오페이 결제 키가 설정되지 않았습니다.");

  const response = await fetch(`${KAKAOPAY_API_URL}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `SECRET_KEY ${config.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ cid: config.cid, ...body }),
    cache: "no-store",
    signal: AbortSignal.timeout(KAKAOPAY_TIMEOUT_MS),
  });
  const data = (await response.json().catch(() => ({}))) as {
    error_code?: number;
    error_message?: string;
  } & T;
  if (!response.ok) {
    throw new KakaoPayError(data.error_message || `카카오페이 요청 실패 (${response.status})`);
  }
  return data;
}

export async function readyKakaoPay(input: KakaoPayReadyInput) {
  const result = await kakaoPayRequest<KakaoPayReadyResult>("ready", {
    partner_order_id: input.partnerOrderId,
    partner_user_id: input.partnerUserId,
    item_name: input.itemName,
    item_code: input.itemCode,
    quantity: 1,
    total_amount: input.amountKrw,
    tax_free_amount: 0,
    approval_url: input.approvalUrl,
    cancel_url: input.cancelUrl,
    fail_url: input.failUrl,
  });
  if (!result.tid || !result.next_redirect_pc_url) {
    throw new KakaoPayError("카카오페이 결제 URL을 받지 못했습니다.");
  }
  return result;
}

export async function approveKakaoPay(input: {
  tid: string;
  partnerOrderId: string;
  partnerUserId: string;
  pgToken: string;
}) {
  return kakaoPayRequest<KakaoPayApprovalResult>("approve", {
    tid: input.tid,
    partner_order_id: input.partnerOrderId,
    partner_user_id: input.partnerUserId,
    pg_token: input.pgToken,
  });
}

export async function getKakaoPayOrder(tid: string) {
  return kakaoPayRequest<KakaoPayOrderResult>("order", { tid });
}
