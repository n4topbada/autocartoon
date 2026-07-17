import type { CloudTasksClient } from "@google-cloud/tasks";
import { runImageGenerationJob, runVideoInline } from "./job-runner";

/**
 * 비동기 잡 디스패치 (GCP 단일).
 * - Cloud Tasks 설정(CLOUD_RUN_BASE_URL + TASKS_AUTH_TOKEN + GOOGLE_CLOUD_PROJECT)이 있으면
 *   → Cloud Tasks로 핸들러 라우트를 재큐한다(운영/Cloud Run).
 * - 없으면(로컬 개발) → 같은 프로세스에서 인라인 실행(fire-and-forget).
 * 잡 상태·진행률·환불은 양쪽 모두 기존 GenerationJob 로직을 재사용한다.
 */

export type JobEngine = "cloudtasks" | "inline";

export function getJobEngine(): JobEngine {
  return process.env.CLOUD_RUN_BASE_URL &&
    process.env.TASKS_AUTH_TOKEN &&
    process.env.GOOGLE_CLOUD_PROJECT
    ? "cloudtasks"
    : "inline";
}

let tasksClientPromise: Promise<CloudTasksClient> | null = null;
async function getTasks(): Promise<CloudTasksClient> {
  if (!tasksClientPromise) {
    tasksClientPromise = (async () => {
      const { CloudTasksClient } = await import("@google-cloud/tasks");
      return new CloudTasksClient();
    })();
  }
  return tasksClientPromise;
}

function taskConfig() {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.CLOUD_TASKS_LOCATION || "asia-northeast3";
  const queue = process.env.CLOUD_TASKS_QUEUE || "wony-jobs";
  const baseUrl = process.env.CLOUD_RUN_BASE_URL?.replace(/\/+$/, "");
  const token = process.env.TASKS_AUTH_TOKEN;
  if (!project || !baseUrl || !token) {
    throw new Error(
      "Cloud Tasks 설정이 필요합니다 (GOOGLE_CLOUD_PROJECT, CLOUD_RUN_BASE_URL, TASKS_AUTH_TOKEN)."
    );
  }
  return { project, location, queue, baseUrl, token };
}

async function enqueue(
  path: string,
  body: Record<string, unknown>,
  delaySeconds = 0
): Promise<string> {
  const { project, location, queue, baseUrl, token } = taskConfig();
  const client = await getTasks();
  const parent = client.queuePath(project, location, queue);
  const [response] = await client.createTask({
    parent,
    task: {
      httpRequest: {
        httpMethod: "POST",
        url: `${baseUrl}${path}`,
        headers: { "Content-Type": "application/json", "X-Tasks-Token": token },
        body: Buffer.from(JSON.stringify(body)).toString("base64"),
      },
      ...(delaySeconds > 0
        ? { scheduleTime: { seconds: Math.floor(Date.now() / 1000) + delaySeconds } }
        : {}),
    },
  });
  return response.name ?? "";
}

export async function dispatchImageJob(jobId: string): Promise<{ runId: string }> {
  if (getJobEngine() === "cloudtasks") {
    return { runId: await enqueue("/api/tasks/image", { jobId }) };
  }
  // 로컬: 같은 프로세스에서 백그라운드 실행(요청은 즉시 202로 반환).
  void runImageGenerationJob(jobId).catch((error) =>
    console.error("Inline image job failed:", error)
  );
  return { runId: "inline" };
}

export async function dispatchVideoJob(jobId: string): Promise<{ runId: string }> {
  if (getJobEngine() === "cloudtasks") {
    return { runId: await enqueue("/api/tasks/video", { jobId }) };
  }
  void runVideoInline(jobId).catch((error) =>
    console.error("Inline video job failed:", error)
  );
  return { runId: "inline" };
}

/** 영상 폴링 재큐(Cloud Tasks 전용). 다음 폴을 delaySeconds 뒤로 예약한다. */
export async function scheduleVideoPoll(
  jobId: string,
  operationName: string,
  attempt: number,
  delaySeconds = 15
): Promise<void> {
  await enqueue("/api/tasks/video-poll", { jobId, operationName, attempt }, delaySeconds);
}

/** Cloud Tasks가 붙인 공유 토큰 검증. 태스크 라우트에서 호출. */
export function verifyTasksToken(req: Request): boolean {
  const token = process.env.TASKS_AUTH_TOKEN;
  return Boolean(token) && req.headers.get("x-tasks-token") === token;
}
