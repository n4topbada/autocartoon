export const CREDIT_AUDIT_STATUSES = ["success", "failure"] as const;
export const CREDIT_AUDIT_DIRECTIONS = ["credit", "debit", "neutral"] as const;

export type CreditAuditStatus = (typeof CREDIT_AUDIT_STATUSES)[number];
export type CreditAuditDirection = (typeof CREDIT_AUDIT_DIRECTIONS)[number];

const SOURCE_LABELS: Record<string, string> = {
  admin: "관리자 지급",
  chat: "워니봇 대화",
  character: "캐릭터 생성",
  "character-designer": "캐릭터 설계",
  gesture: "제스처 생성",
  background: "배경 생성",
  image: "이미지 생성",
  video: "영상 생성",
  "video-plan": "영상 기획",
  "video-prompt": "영상 프롬프트",
  "project-brief": "프로젝트 기획",
  tts: "음성 생성",
  ocr: "글자 추출",
  cutout: "누끼 따기",
  marketplace: "마켓 구매",
  coupon: "쿠폰",
  kakaopay: "카카오페이",
  welcome: "가입 보너스",
  "account-link": "계정 연결",
  "account-withdrawal": "회원 탈퇴",
  tier: "요금제 제공량",
};

const OPERATION_LABELS: Record<string, string> = {
  charge: "크레딧 차감",
  refund: "크레딧 환불",
  grant: "크레딧 지급",
  purchase: "결제 크레딧 적립",
  adjustment: "잔액 조정",
  usage: "유료 기능 실행",
  charge_reused: "기존 차감 확인",
  coupon_redeem: "쿠폰 등록",
  payment_ready: "결제 시작",
  payment_cancel: "결제 취소",
  payment_approve: "결제 승인",
  payment_reconcile: "결제 검증",
  account_withdrawal: "탈퇴 잔액 정리",
};

export const CREDIT_AUDIT_METADATA_LABELS: Record<string, string> = {
  amountKrw: "결제 금액",
  productCode: "상품 코드",
  provider: "AI 제공자",
  model: "모델",
  imageSize: "해상도",
  requestedCount: "요청 수",
  deliveredCount: "완료 수",
  campaignId: "쿠폰 캠페인 ID",
  campaignTitle: "쿠폰명",
  paymentId: "결제 ID",
  paymentStatus: "결제 상태",
  grantMode: "지급 방식",
  adminProductCode: "관리자 선택 상품",
  idempotent: "중복 실행 방지",
};

export function getCreditAuditSourceLabel(source: string) {
  return SOURCE_LABELS[source] || source.replaceAll("-", " ");
}

export function getCreditAuditOperationLabel(operation: string) {
  return OPERATION_LABELS[operation] || operation.replaceAll("_", " ");
}

export function getCreditAuditDirectionLabel(direction: string) {
  if (direction === "credit") return "충전·지급";
  if (direction === "debit") return "사용·차감";
  return "검증·상태";
}

export function getCreditAuditStatusLabel(status: string) {
  return status === "failure" ? "실패" : "성공";
}

export function buildCreditAuditSummary(input: {
  source: string;
  operation: string;
  status: CreditAuditStatus;
}) {
  const source = getCreditAuditSourceLabel(input.source);
  const operation = getCreditAuditOperationLabel(input.operation);
  return input.status === "failure"
    ? `${source} ${operation} 실패`
    : `${source} ${operation}`;
}

export function normalizeCreditAuditSearch(value: string) {
  return value.trim().slice(0, 160);
}

export function formatCreditAuditMetadataValue(key: string, value: unknown) {
  if (key === "amountKrw" && typeof value === "number") {
    return `${value.toLocaleString("ko-KR")}원`;
  }
  if (typeof value === "boolean") return value ? "예" : "아니요";
  if (typeof value === "number") return value.toLocaleString("ko-KR");
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(String).join(", ");
  return value && typeof value === "object" ? "세부 정보 있음" : "-";
}
