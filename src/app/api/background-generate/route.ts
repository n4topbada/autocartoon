import { NextResponse } from "next/server";

// 이 동기 엔드포인트는 더 이상 사용하지 않는다. 배경 생성은 durable 작업 경로
// (POST /api/generate, jobKind="background")로 통합되어 실패 시 자동 환불과
// 재접속 복구가 보장된다. 과거처럼 크레딧을 선차감한 뒤 타임아웃으로 유실되는
// 문제를 막기 위해 크레딧을 차감하지 않고 410으로 응답한다.
export function POST() {
  return NextResponse.json(
    {
      error:
        "이 엔드포인트는 더 이상 사용되지 않습니다. 배경 생성은 작업 기반 경로(/api/generate)로 이동했습니다.",
    },
    { status: 410 }
  );
}
