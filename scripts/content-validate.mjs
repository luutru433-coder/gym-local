import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const vitest = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
const tests = [
  fileURLToPath(new URL("../packages/catalog/src/catalog.test.ts", import.meta.url)),
  fileURLToPath(new URL("../packages/catalog/src/animation-catalog.test.ts", import.meta.url)),
  fileURLToPath(new URL("./animation-pilot-assets.test.mjs", import.meta.url))
];
const result = spawnSync(process.execPath, [vitest, "run", ...tests], { stdio: "inherit", env: { ...process.env, CI: "true" } });

if (result.error) throw result.error;
process.exit(result.status ?? 1);
