import { spawn } from "node:child_process";
import path from "node:path";
import {
  assertWonyLocalEnvironment,
  loadWonyProjectEnvironment,
} from "./wony-environment.mjs";

const projectRoot = process.cwd();
const environment = loadWonyProjectEnvironment({
  root: projectRoot,
  nodeEnv: "development",
});
assertWonyLocalEnvironment(environment);

const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
const child = spawn(process.execPath, [tsxCli, ...process.argv.slice(2)], {
  cwd: projectRoot,
  env: environment,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error("Failed to start the guarded TypeScript command:", error);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
