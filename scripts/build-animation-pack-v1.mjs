/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import { pathToFileURL } from "node:url";
import {
  publishAnimationPack,
  validateAnimationPackSource
} from "./animation-pack-v1.mjs";

function usage() {
  return "Usage: node scripts/build-animation-pack-v1.mjs <validate|build> --source <source-dir> [--output <absent-output-dir>]";
}

export function parseCliArguments(argv) {
  const [mode, ...rest] = argv;
  if (mode !== "validate" && mode !== "build") throw new Error(usage());
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if ((flag !== "--source" && flag !== "--output") || value === undefined || value.startsWith("--") || values.has(flag)) throw new Error(usage());
    values.set(flag, value);
  }
  if (!values.has("--source") || (mode === "build") !== values.has("--output")) throw new Error(usage());
  return { mode, source: values.get("--source"), output: values.get("--output") };
}

export async function main(argv = process.argv.slice(2)) {
  const arguments_ = parseCliArguments(argv);
  if (arguments_.mode === "validate") {
    const validated = await validateAnimationPackSource(arguments_.source);
    process.stdout.write(`VALID ${validated.manifest.packId}@${validated.manifest.version}\n`);
    return;
  }
  const result = await publishAnimationPack(arguments_.source, arguments_.output);
  process.stdout.write(`BUILT ${result.manifest.packId}@${result.manifest.version} ${result.outputDirectory}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
