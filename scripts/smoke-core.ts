/**
 * 复原核心样例冒烟：直接驱动求解器验证关键结论。
 * 任一断言失败即以非零退出码结束。
 */
import { solve } from '../src/core/solve';
import { SAMPLE_BROKEN, SAMPLE_CLEAN, SAMPLE_NOISY } from '../src/core/samples';

let failures = 0;

function check(name: string, cond: boolean, detail: string): void {
  if (cond) {
    console.log(`  [OK] ${name} —— ${detail}`);
  } else {
    failures++;
    console.error(`  [FAIL] ${name} —— ${detail}`);
  }
}

console.log('样例 1：干净 SOS 纸带');
{
  const out = solve(SAMPLE_CLEAN.input);
  check('译出 SOS', out.kind === 'solved' && out.text === 'SOS',
    out.kind === 'solved' ? `text=${out.text}` : `kind=${out.kind}`);
  if (out.kind === 'solved') {
    check('单位时长为 2', out.unit === 2, `unit=${out.unit}`);
    check('零偏差', out.totalDeviation === 0 && out.maxDeviation === 0,
      `total=${out.totalDeviation} max=${out.maxDeviation}`);
    check('解释段数与游程一致', out.interpretations.length === SAMPLE_CLEAN.input.runs.length,
      `${out.interpretations.length}/${SAMPLE_CLEAN.input.runs.length}`);
  }
}

console.log('样例 2：受潮 SOS 纸带');
{
  const out = solve(SAMPLE_NOISY.input);
  check('噪声下仍译出 SOS', out.kind === 'solved' && out.text === 'SOS',
    out.kind === 'solved' ? `text=${out.text}` : `kind=${out.kind}`);
  if (out.kind === 'solved') {
    check('单位时长为 2', out.unit === 2, `unit=${out.unit}`);
    check('总偏差为 6', out.totalDeviation === 6, `total=${out.totalDeviation}`);
    check('摩尔斯序列正确', out.morse === '... --- ...', `morse=${out.morse}`);
  }
}

console.log('样例 3：无解 SOSO 纸带（不得输出貌似完整的电文）');
{
  const out = solve(SAMPLE_BROKEN.input);
  check('判定无解', out.kind === 'no-solution', `kind=${out.kind}`);
  if (out.kind === 'no-solution') {
    const last = SAMPLE_BROKEN.input.runs.length - 1;
    check('最早失败位置在末段游程', out.failRunIndex === last,
      `failRunIndex=${out.failRunIndex}（期望 ${last}）`);
    check(
      '给出词典前缀原因',
      out.reasons.some((r) => r.includes('SOSO') || r.includes('「O」')),
      `reasons=${JSON.stringify(out.reasons)}`,
    );
  }
}

if (failures > 0) {
  console.error(`核心样例冒烟：${failures} 项失败`);
  process.exit(1);
}
console.log('核心样例冒烟：全部通过');
