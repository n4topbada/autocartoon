import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  assertWonyLocalEnvironment,
  loadWonyProjectEnvironment,
} from "./wony-environment.mjs";

const projectRoot = process.cwd();
const nextEnvironmentTypesPath = path.join(projectRoot, "next-env.d.ts");
const nextEnvironmentTypes = existsSync(nextEnvironmentTypesPath)
  ? readFileSync(nextEnvironmentTypesPath, "utf8")
  : null;
const environment = loadWonyProjectEnvironment({
  root: projectRoot,
  nodeEnv: "development",
});
assertWonyLocalEnvironment(environment);

// Keep development output separate so a browser session cannot corrupt a
// concurrent production build's .next directory.
environment.NEXT_DIST_DIR ||= ".next-dev";

const nextCli = path.join(
  projectRoot,
  "node_modules",
  "next",
  "dist",
  "bin",
  "next"
);
const child = spawn(process.execPath, [nextCli, "dev", ...process.argv.slice(2)], {
  cwd: projectRoot,
  env: environment,
  stdio: "inherit",
});

function restoreNextEnvironmentTypes() {
  if (nextEnvironmentTypes === null) return;
  try {
    const current = readFileSync(nextEnvironmentTypesPath, "utf8");
    if (current !== nextEnvironmentTypes) {
      writeFileSync(nextEnvironmentTypesPath, nextEnvironmentTypes, "utf8");
    }
  } catch {
    // Next.js can briefly replace this generated file during startup.
  }
}

let restoreAttempts = 0;
const restoreTimer = setInterval(() => {
  restoreNextEnvironmentTypes();
  restoreAttempts += 1;
  if (restoreAttempts >= 20) clearInterval(restoreTimer);
}, 500);
restoreTimer.unref();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error("Failed to start the Next.js development server:", error);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  clearInterval(restoreTimer);
  restoreNextEnvironmentTypes();
  process.exitCode = code ?? 1;
});
