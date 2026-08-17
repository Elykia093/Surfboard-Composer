/**
 * 测试助手:极简断言 + 结构,让测试不依赖任何框架也能跑
 */
export function describe(name, fn) {
  console.log(`\n# ${name}`);
  fn();
}

export function it(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    process.exitCode = 1;
  }
}

export function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg || "assertion failed");
  }
}

export function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(
      `${msg || "not equal"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}
