import { spawn } from "node:child_process";
import path from "node:path";
import {
  assertWonyLocalEnvironment,
  loadWonyProjectEnvironment,
} from "./wony-environment.mjs";

const projectRoot = process.cwd();
const environment = loadWonyProjectEnvironment({
  root: projectRoot,
  nodeEnv: "production",
});
assertWonyLocalEnvironment(environment);

const nextCli = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextCli, "start", ...process.argv.slice(2)], {
  cwd: projectRoot,
  env: environment,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error("Failed to start the Next.js production server:", error);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
