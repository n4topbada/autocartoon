import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLogEntry,
  cloudTaskLogFields,
} from "../src/lib/observability";

test("structured logs include Cloud Run trace correlation", () => {
  const previousProject = process.env.GOOGLE_CLOUD_PROJECT;
  process.env.GOOGLE_CLOUD_PROJECT = "example-project";

  try {
    const request = new Request("https://example.com/api/generate", {
      headers: {
        "X-Cloud-Trace-Context": "105445aa7843bc8bf206b12000100000/1;o=1",
      },
    });
    const entry = buildLogEntry(
      "NOTICE",
      "generation.request.accepted",
      "Generation request accepted",
      { jobId: "job-1" },
      request
    );

    assert.equal(entry.severity, "NOTICE");
    assert.equal(entry.event, "generation.request.accepted");
    assert.equal(entry.jobId, "job-1");
    assert.equal(
      entry["logging.googleapis.com/trace"],
      "projects/example-project/traces/105445aa7843bc8bf206b12000100000"
    );
  } finally {
    if (previousProject === undefined) delete process.env.GOOGLE_CLOUD_PROJECT;
    else process.env.GOOGLE_CLOUD_PROJECT = previousProject;
  }
});

test("task log context contains retry metadata without request body", () => {
  const fields = cloudTaskLogFields(
    new Request("https://example.com/api/tasks/image", {
      headers: {
        "X-CloudTasks-TaskName": "task-123",
        "X-CloudTasks-TaskRetryCount": "2",
        "X-CloudTasks-TaskExecutionCount": "3",
        "X-CloudTasks-TaskPreviousResponse": "500",
      },
    })
  );

  assert.deepEqual(fields, {
    taskName: "task-123",
    taskRetryCount: "2",
    taskExecutionCount: "3",
    taskPreviousResponse: "500",
    taskRetryReason: null,
  });
});

test("structured log strings are bounded", () => {
  const entry = buildLogEntry("ERROR", "test.failed", "x ".repeat(1_500), {
    errorMessage: "y ".repeat(1_500),
  });

  assert.equal(entry.message.length, 2_003);
  assert.equal(entry.errorMessage.length, 2_003);
});

test("structured logs redact common sensitive values", () => {
  const entry = buildLogEntry("ERROR", "test.failed", "contact user@example.com", {
    errorMessage: "token=top-secret-value authorization=Bearer-123",
  });

  assert.equal(entry.message, "contact [redacted-email]");
  assert.equal(
    entry.errorMessage,
    "token=[redacted] authorization=[redacted]"
  );
});
