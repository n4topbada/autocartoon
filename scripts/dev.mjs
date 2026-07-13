import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

const projectRoot = process.cwd();
const environment = { ...process.env };
const environmentFiles = [
  ".env",
  ".env.development",
  ".env.local",
  ".env.development.local",
];

for (const file of environmentFiles) {
  const filePath = path.join(projectRoot, file);
  if (!existsSync(filePath)) continue;
  Object.assign(environment, parseEnv(readFileSync(filePath, "utf8")));
}

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

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error("Failed to start the Next.js development server:", error);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
