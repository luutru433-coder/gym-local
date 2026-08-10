import { spawnSync } from "node:child_process";

const status = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8", shell: process.platform === "win32" });
const files = status.stdout.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).replaceAll("\\", "/"));
const codeChanged = files.some((file) => /^(apps|packages|scripts|tests|vite\.config|package|tsconfig|eslint)/.test(file));
const contentChanged = files.some((file) => /^(content|packages\/catalog)/.test(file));

const commands = [];
if (codeChanged) commands.push(["typecheck"], ["test"]);
if (contentChanged) commands.push(["content:validate"]);
if (!commands.length) {
  console.log("No code or catalog changes detected; documentation-only verification complete.");
  process.exit(0);
}

for (const args of commands) {
  console.log(`\n> pnpm ${args.join(" ")}`);
  const result = spawnSync("pnpm", args, { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, CI: "true" } });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
