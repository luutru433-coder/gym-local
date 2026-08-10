import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const vitest = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
const test = fileURLToPath(new URL("../packages/catalog/src/catalog.test.ts", import.meta.url));
const result = spawnSync(process.execPath, [vitest, "run", test], { stdio: "inherit", env: { ...process.env, CI: "true" } });

if (result.error) throw result.error;
process.exit(result.status ?? 1);
