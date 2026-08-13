import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

const sourceExtensions = new Set([".js", ".mjs", ".ts", ".tsx"]);
const generatedDirectories = new Set(["dist", "dev-dist", "coverage", "node_modules"]);

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return generatedDirectories.has(entry.name) ? [] : sourceFiles(path);
    return sourceExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

function runArchitectureAudit() {
  const violations = [];
  for (const path of ["apps", "packages"].flatMap(sourceFiles)) {
    const file = relative(process.cwd(), path).replaceAll("\\", "/");
    const source = readFileSync(path, "utf8");
    const providerModule = /\/src\/providers\//.test(`/${file}`);
    if (/\b(?:globalThis\.)?fetch\s*\(/.test(source) && !providerModule) {
      violations.push(`${file}: network requests belong in src/providers/*`);
    }

    const storageOwner = file.startsWith("packages/storage/");
    const browserStorage = /\b(?:indexedDB|localStorage|sessionStorage)\b|\bnavigator\.storage\b|from\s+["']dexie["']|\bsqlite3InitModule\b|\bOpfsSAHPool(?:Db|Vfs)?\b/.test(source);
    if (browserStorage && !storageOwner) {
      violations.push(`${file}: database and browser storage access belongs in packages/storage`);
    }
  }

  if (violations.length) {
    console.error("Architecture boundary violations:\n" + violations.map((violation) => `- ${violation}`).join("\n"));
    return false;
  }
  console.log("Architecture boundaries verified.");
  return true;
}

if (!runArchitectureAudit()) process.exit(1);
if (process.argv.includes("--architecture")) process.exit(0);

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
