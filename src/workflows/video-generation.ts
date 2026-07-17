import { sleep } from "workflow";
import {
  failGenerationJob,
} from "@/lib/generation-jobs";
import {
  pollAndPersistVideo,
  startVideoOperation,
  timeoutVideoJob,
} from "@/lib/video-generation";

async function startVideo(jobId: string) {
  "use step";
  return startVideoOperation(jobId);
}

async function pollVideo(jobId: string, operationName: string) {
  "use step";
  return pollAndPersistVideo(jobId, operationName);
}

async function markVideoTimeout(jobId: string) {
  "use step";
  return timeoutVideoJob(jobId);
}

async function failVideoJob(jobId: string, message: string) {
  "use step";
  await failGenerationJob(jobId, message);
}

startVideo.maxRetries = 0;

export async function videoGenerationWorkflow(jobId: string) {
  "use workflow";

  try {
    const started = await startVideo(jobId);
    if (!started.operationName) return;

    if (started.done) {
      // 제출 즉시 완료로 보고된 경우 바로 저장을 시도한다. 저장이 일시적 오류로
      // 실패(false)하면 그냥 종료하지 않고 아래 재시도 루프로 이어가, 최종적으로
      // markVideoTimeout이 실패+환불을 보장하도록 한다(리퍼에만 의존하지 않음).
      if (await pollVideo(jobId, started.operationName)) return;
    }

    for (let attempt = 0; attempt < 120; attempt += 1) {
      await sleep("15s");
      const done = await pollVideo(jobId, started.operationName);
      if (done) return;
    }

    await markVideoTimeout(jobId);
  } catch (error) {
    // 스텝 재시도까지 모두 실패해 워크플로가 죽는 경우에도 작업이 running에 멈추지 않도록
    // 마지막 보상 단계로 실패+환불을 보장한다(멱등).
    await failVideoJob(
      jobId,
      error instanceof Error ? error.message : "영상 생성 워크플로가 중단되었습니다."
    );
  }
}
