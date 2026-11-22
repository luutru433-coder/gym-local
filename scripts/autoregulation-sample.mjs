import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent", optimizeDeps: { noDiscovery: true } });
try {
  const { runAutoregulationSample } = await server.ssrLoadModule(resolve("packages/workouts/src/autoregulation-sample.ts"));
  const run = runAutoregulationSample();
  writeFileSync("docs/autoregulation-sample-run.md", run.markdown + "\n");
  console.log(JSON.stringify({ engine: run.engine, baseline: run.baseline }, null, 2));
} finally {
  await server.close();
}
