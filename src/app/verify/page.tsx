"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function VerifyContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const errorMessages: Record<string, string> = {
    invalid_token: "유효하지 않은 인증 링크입니다.",
    token_expired: "인증 링크가 만료되었습니다. 다시 가입해주세요.",
  };

  return (
    <div style={{ textAlign: "center" }}>
      {error ? (
        <>
          <p style={{ color: "#ef4444", fontSize: 18 }}>
            {errorMessages[error] || "인증에 실패했습니다."}
          </p>
          <a href="/login" style={{ color: "#818cf8", marginTop: 16, display: "block" }}>
            로그인 페이지로 이동
          </a>
        </>
      ) : (
        <p>인증 처리 중...</p>
      )}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#0a0a0a",
      color: "#f3f4f6",
    }}>
      <Suspense fallback={<p>로딩 중...</p>}>
        <VerifyContent />
      </Suspense>
    </div>
  );
}
