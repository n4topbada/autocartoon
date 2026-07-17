import assert from "node:assert/strict";
import test from "node:test";
import { getJobEngine, verifyTasksToken } from "../src/lib/job-engine";

test("Cloud Tasks authentication ignores secret file trailing whitespace", () => {
  const previousToken = process.env.TASKS_AUTH_TOKEN;
  process.env.TASKS_AUTH_TOKEN = "task-token\r\n";

  try {
    assert.equal(
      verifyTasksToken(
        new Request("https://example.com/api/tasks/image", {
          headers: { "X-Tasks-Token": "task-token" },
        })
      ),
      true
    );
  } finally {
    if (previousToken === undefined) delete process.env.TASKS_AUTH_TOKEN;
    else process.env.TASKS_AUTH_TOKEN = previousToken;
  }
});

test("Cloud Tasks mode rejects a whitespace-only authentication secret", () => {
  const previousToken = process.env.TASKS_AUTH_TOKEN;
  const previousBaseUrl = process.env.CLOUD_RUN_BASE_URL;
  const previousProject = process.env.GOOGLE_CLOUD_PROJECT;
  process.env.TASKS_AUTH_TOKEN = " \n";
  process.env.CLOUD_RUN_BASE_URL = "https://example.com";
  process.env.GOOGLE_CLOUD_PROJECT = "example-project";

  try {
    assert.equal(getJobEngine(), "inline");
  } finally {
    if (previousToken === undefined) delete process.env.TASKS_AUTH_TOKEN;
    else process.env.TASKS_AUTH_TOKEN = previousToken;
    if (previousBaseUrl === undefined) delete process.env.CLOUD_RUN_BASE_URL;
    else process.env.CLOUD_RUN_BASE_URL = previousBaseUrl;
    if (previousProject === undefined) delete process.env.GOOGLE_CLOUD_PROJECT;
    else process.env.GOOGLE_CLOUD_PROJECT = previousProject;
  }
});
