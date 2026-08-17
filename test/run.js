#!/usr/bin/env node
/**
 * 测试运行器:加载所有 test/*.test.js 文件并执行
 */
import { readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  const files = readdirSync(here).filter((f) => f.endsWith(".test.js"));
  if (files.length === 0) {
    console.log("No test files found");
    return;
  }
  console.log(`Running ${files.length} test file(s)...\n`);
  for (const file of files) {
    await import(`./${file}`);
  }
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
