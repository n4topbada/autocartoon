import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  applySafeBuildEnvironment,
  assertWonyLocalEnvironment,
  loadWonyProjectEnvironment,
} from "./wony-environment.mjs";

const projectRoot = process.cwd();
const environment = loadWonyProjectEnvironment({
  root: projectRoot,
  nodeEnv: "production",
});

if (existsSync(path.join(projectRoot, ".env.local"))) {
  assertWonyLocalEnvironment(environment);
} else {
  applySafeBuildEnvironment(environment);
}

environment.WONY_DATABASE_GUARD_MODE = "build";

const nextCli = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextCli, "build", ...process.argv.slice(2)], {
  cwd: projectRoot,
  env: environment,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error("Failed to start the Next.js build:", error);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
