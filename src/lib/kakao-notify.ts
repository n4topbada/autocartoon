/**
 * 카카오톡 알림톡 발송 (솔라피 API)
 *
 * 사용자가 해야 할 설정:
 * 1. https://solapi.com 가입
 * 2. 카카오 비즈채널 연동
 * 3. 알림톡 템플릿 등록 + 검수
 * 4. .env에 SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_PFID, WONY_PHONE 설정
 */

const API_KEY = process.env.SOLAPI_API_KEY;
const API_SECRET = process.env.SOLAPI_API_SECRET;
const PFID = process.env.SOLAPI_PFID; // 카카오 비즈채널 발신프로필 ID
const WONY_PHONE = process.env.WONY_PHONE;

export interface KakaoNotifyResult {
  success: boolean;
  error?: string;
}

/**
 * 솔라피 알림톡 발송
 */
export async function sendKakaoNotification(
  templateId: string,
  variables: Record<string, string>
): Promise<KakaoNotifyResult> {
  if (!API_KEY || !API_SECRET || !PFID || !WONY_PHONE) {
    console.warn("[KakaoNotify] 환경변수 미설정 — 알림톡 발송 건너뜀");
    return { success: false, error: "카카오톡 알림톡 환경변수가 설정되지 않았습니다." };
  }

  try {
    const res = await fetch("https://api.solapi.com/messages/v4/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        message: {
          to: WONY_PHONE,
          from: WONY_PHONE,
          kakaoOptions: {
            pfId: PFID,
            templateId,
            variables,
          },
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[KakaoNotify] 발송 실패:", text);
      return { success: false, error: text };
    }

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    console.error("[KakaoNotify] 오류:", msg);
    return { success: false, error: msg };
  }
}
