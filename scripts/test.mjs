import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  applySafeBuildEnvironment,
  assertWonyLocalEnvironment,
  loadWonyProjectEnvironment,
} from "./wony-environment.mjs";

const projectRoot = process.cwd();
const environment = loadWonyProjectEnvironment({ root: projectRoot, nodeEnv: "test" });

if (existsSync(path.join(projectRoot, ".env.local"))) {
  assertWonyLocalEnvironment(environment);
} else {
  applySafeBuildEnvironment(environment);
}

environment.NODE_ENV = "test";
environment.WONY_DATABASE_GUARD_MODE = "test";

const testFiles = readdirSync(path.join(projectRoot, "tests"))
  .filter((file) => file.endsWith(".test.ts"))
  .sort()
  .map((file) => path.join(projectRoot, "tests", file));
const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
const child = spawn(process.execPath, [tsxCli, "--test", ...testFiles], {
  cwd: projectRoot,
  env: environment,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error("Failed to start the test runner:", error);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
