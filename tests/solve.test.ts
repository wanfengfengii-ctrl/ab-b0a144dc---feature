import { describe, expect, it } from 'vitest';
import { solve, usableWords, validateInput } from '../src/core/solve';
import {
  SAMPLE_BROKEN,
  SAMPLE_CLEAN,
  SAMPLE_NOISY,
  SAMPLE_READBACK,
  SAMPLE_READBACK_FAIL,
  runsFromDurations,
} from '../src/core/samples';
import type { RunInterpretation, SolveInput } from '../src/core/types';

function solvedText(input: SolveInput) {
  const out = solve(input);
  if (out.kind !== 'solved') throw new Error(`expected solved, got ${out.kind}`);
  return out;
}

/** 解释编码：点/符内=0，划/字母=1，词=2（与求解器决胜口径一致）。 */
function codeOf(interps: RunInterpretation[]): string {
  return interps
    .map((it) => (it.type === 'dot' || it.type === 'intra' ? '0' : it.type === 'word' ? '2' : '1'))
    .join('');
}

describe('干净样例', () => {
  it('零偏差译出 SOS，单位时长 2', () => {
    const out = solvedText(SAMPLE_CLEAN.input);
    expect(out.text).toBe('SOS');
    expect(out.words).toEqual(['SOS']);
    expect(out.unit).toBe(2);
    expect(out.totalDeviation).toBe(0);
    expect(out.maxDeviation).toBe(0);
    expect(out.morse).toBe('... --- ...');
    expect(out.interpretations).toHaveLength(SAMPLE_CLEAN.input.runs.length);
    expect(out.interpretations[0].type).toBe('dot');
    expect(out.interpretations[5].type).toBe('letter');
    expect(out.interpretations[6].type).toBe('dash');
  });
});

describe('受潮样例', () => {
  it('噪声下仍复原 SOS，总偏差 6、最大单段偏差 1', () => {
    const out = solvedText(SAMPLE_NOISY.input);
    expect(out.text).toBe('SOS');
    expect(out.unit).toBe(2);
    expect(out.totalDeviation).toBe(6);
    expect(out.maxDeviation).toBe(1);
    // 累计偏差校验
    const cum = out.interpretations.reduce((s, r) => s + r.deviation, 0);
    expect(cum).toBe(out.totalDeviation);
  });
});

describe('词间隔（词界）', () => {
  it('7 单位空白译作词界，得到两个词', () => {
    const out = solvedText({
      runs: runsFromDurations([
        2, 2, 2, 2, 2, // S
        14, // 词间隔 7*2
        6, 2, 6, 2, 6, // O
        6, // 字母间隔
        2, 2, 2, 2, 2, // S
      ]),
      unitMin: 1,
      unitMax: 3,
      alphabet: ['S', 'O'],
      dictionary: ['S', 'OS'],
    });
    expect(out.words).toEqual(['S', 'OS']);
    expect(out.text).toBe('S OS');
    expect(out.unit).toBe(2);
    expect(out.interpretations[5].type).toBe('word');
    expect(out.morse).toBe('... / --- ...');
  });
});

describe('稳定选择次序', () => {
  it('总偏差优先：单位时长取偏差最小者', () => {
    const out = solvedText({
      runs: runsFromDurations([2]),
      unitMin: 1,
      unitMax: 3,
      alphabet: ['E'],
      dictionary: ['E'],
    });
    expect(out.unit).toBe(2); // |2-2|=0 优于 u=1、u=3 的偏差 1
    expect(out.totalDeviation).toBe(0);
  });

  it('偏差并列时按解释编码字典序：点(0) 优先于划(1)', () => {
    // u=1 时点、划偏差都是 1；编码 '0' < '1'，应译作 E 而非 T
    const out = solvedText({
      runs: runsFromDurations([2]),
      unitMin: 1,
      unitMax: 1,
      alphabet: ['E', 'T'],
      dictionary: ['E', 'T'],
    });
    expect(out.text).toBe('E');
    expect(out.encoding).toBe('0');
    expect(out.totalDeviation).toBe(1);
  });

  it('跨单位并列时同样按编码稳定选择', () => {
    // u=4 点(偏差1) 与 u=2 划(偏差1) 并列，编码 '0' < '1' → E
    const out = solvedText({
      runs: runsFromDurations([5]),
      unitMin: 2,
      unitMax: 4,
      alphabet: ['E', 'T'],
      dictionary: ['E', 'T'],
    });
    expect(out.text).toBe('E');
    expect(out.unit).toBe(4);
  });

  it('总偏差相同时取单段最大偏差更小者', () => {
    // 信号时长均为 1（u=1 零偏差）；两个可行复原总偏差都是 8：
    // “S”（符内+符内）：空白偏差 [8,0] → 最大 8
    // “E E E”（词界+词界）：空白偏差 [2,6] → 最大 6  ← 应胜出
    const out = solvedText({
      runs: runsFromDurations([1, 9, 1, 1, 1]),
      unitMin: 1,
      unitMax: 1,
      alphabet: ['E', 'S'],
      dictionary: ['E', 'S'],
    });
    expect(out.words).toEqual(['E', 'E', 'E']);
    expect(out.totalDeviation).toBe(8);
    expect(out.maxDeviation).toBe(6);
  });
});

describe('无解定位', () => {
  it('SOSO 样例：最早失败在末段游程，并给出词典前缀原因', () => {
    const out = solve(SAMPLE_BROKEN.input);
    if (out.kind !== 'no-solution') throw new Error(`expected no-solution, got ${out.kind}`);
    expect(out.failRunIndex).toBe(SAMPLE_BROKEN.input.runs.length - 1); // 22
    expect(out.reasons.length).toBeGreaterThan(0);
    expect(out.reasons.some((r) => r.includes('SOSO') || r.includes('「O」'))).toBe(true);
  });

  it('结尾不是完整单词：「SO」不是词典单词', () => {
    const out = solve({
      runs: runsFromDurations([2, 2, 2, 2, 2, 6, 6, 2, 6, 2, 6]), // SO
      unitMin: 1,
      unitMax: 4,
      alphabet: ['S', 'O'],
      dictionary: ['SOS'],
    });
    if (out.kind !== 'no-solution') throw new Error(`expected no-solution, got ${out.kind}`);
    expect(out.failRunIndex).toBe(10);
    expect(out.reasons.some((r) => r.includes('完整单词'))).toBe(true);
  });

  it('末尾信号组合不在受限字母表', () => {
    const out = solve({
      runs: runsFromDurations([2, 2, 2]), // “..” = I，不在字母表 {S}
      unitMin: 1,
      unitMax: 2,
      alphabet: ['S'],
      dictionary: ['S'],
    });
    if (out.kind !== 'no-solution') throw new Error(`expected no-solution, got ${out.kind}`);
    expect(out.failRunIndex).toBe(2);
    expect(out.reasons.some((r) => r.includes('受限字母表'))).toBe(true);
  });

  it('词典在受限字母表下无可用单词', () => {
    const out = solve({
      runs: runsFromDurations([2]),
      unitMin: 1,
      unitMax: 2,
      alphabet: ['S'],
      dictionary: ['ABC'],
    });
    expect(out.kind).toBe('no-solution');
  });
});

describe('输入校验', () => {
  const base: SolveInput = {
    runs: runsFromDurations([2]),
    unitMin: 1,
    unitMax: 2,
    alphabet: ['E'],
    dictionary: ['E'],
  };

  it('合法输入无错误', () => {
    expect(validateInput(base)).toEqual([]);
  });

  it('偶数段（未以信号结束）', () => {
    expect(validateInput({ ...base, runs: runsFromDurations([2, 2]) }).length).toBeGreaterThan(0);
  });

  it('非正时长', () => {
    expect(
      validateInput({ ...base, runs: [{ kind: 'signal', duration: 0 }] }).length,
    ).toBeGreaterThan(0);
  });

  it('单位范围倒置', () => {
    expect(validateInput({ ...base, unitMin: 3, unitMax: 1 }).length).toBeGreaterThan(0);
  });

  it('空字母表 / 空词典', () => {
    expect(validateInput({ ...base, alphabet: [] }).length).toBeGreaterThan(0);
    expect(validateInput({ ...base, dictionary: [] }).length).toBeGreaterThan(0);
  });

  it('solve 对非法输入返回 invalid', () => {
    const out = solve({ ...base, runs: [] });
    expect(out.kind).toBe('invalid');
  });
});

describe('词典过滤', () => {
  it('usableWords 仅保留受限字母表内的词并去重', () => {
    expect(usableWords(['S', 'O'], ['SOS', 'SOS', ' so ', 'SEA', ''])).toEqual(['SOS', 'SO']);
  });
});

// ---------------------------------------------------------------------------
// 回读一致性
// ---------------------------------------------------------------------------

/** SOS 单遍游程（17 段，以信号起止）。 */
const SOS_HALF = [
  2, 2, 2, 2, 2, // S
  6, // 字母间隔
  6, 2, 6, 2, 6, // O
  6, // 字母间隔
  2, 2, 2, 2, 2, // S
];

describe('回读一致性 · 成功', () => {
  it('样例：同一条 SOS 连发两遍，零偏差、共同单位 2', () => {
    const out = solve(SAMPLE_READBACK.input);
    if (out.kind !== 'readback-solved') throw new Error(`expected readback-solved, got ${out.kind}`);
    expect(out.text).toBe('SOS');
    expect(out.words).toEqual(['SOS']);
    expect(out.unit).toBe(2);
    expect(out.totalDeviation).toBe(0);
    expect(out.maxDeviation).toBe(0);
    expect(out.morse).toBe('... --- ...');
    expect(out.dividerRunIndex).toBe(17);
    expect(out.divider.type).toBe('word');
    expect(out.first.interpretations).toHaveLength(17);
    expect(out.second.interpretations).toHaveLength(17);
  });

  it('全序列解释 = 第一遍 + 分界词停顿 + 第二遍，且两遍共用同一套解释', () => {
    const out = solve(SAMPLE_READBACK.input);
    if (out.kind !== 'readback-solved') throw new Error(`expected readback-solved, got ${out.kind}`);
    expect(out.encoding).toHaveLength(35);
    expect(out.encoding).toBe(codeOf(out.first.interpretations) + '2' + codeOf(out.second.interpretations));
    // 两遍逐段同构：类型、目标倍数完全相同
    out.first.interpretations.forEach((it, j) => {
      expect(out.second.interpretations[j].type).toBe(it.type);
      expect(out.second.interpretations[j].targetUnits).toBe(it.targetUnits);
    });
    // 全序列偏差 = 两半偏差之和 + 分界停顿
    const sum = [
      ...out.first.interpretations,
      ...out.second.interpretations,
    ].reduce((s, it) => s + it.deviation, 0) + out.divider.deviation;
    expect(sum).toBe(out.totalDeviation);
  });

  it('第二遍单独求解会选不同字母时，回读模式仍强制两遍逐字相同（联合而非筛选）', () => {
    // 单信号半：第一遍实测 1（u=1 时点偏差 0、划偏差 2 → 必为点=E）；
    // 第二遍实测 3（u=1 时若单独求解会选划=T，偏差 0）。
    // 联合 DP 必须选同一符号：两点总成本 2，两划总成本 4 → 共享点，两侧都是 E。
    const out = solve({
      runs: runsFromDurations([1, 7, 3]),
      unitMin: 1,
      unitMax: 1,
      alphabet: ['E', 'T'],
      dictionary: ['E', 'T'],
      readback: true,
    });
    if (out.kind !== 'readback-solved') throw new Error(`expected readback-solved, got ${out.kind}`);
    expect(out.text).toBe('E');
    expect(out.encoding).toBe('020');
    expect(out.totalDeviation).toBe(2);
  });

  it('多词电文的内部词界与结尾词界在两遍间同步', () => {
    // 半遍 = S(词界)OS：词界空白位于单遍内部；两遍由正中词停顿分隔。
    const half = [
      2, 2, 2, 2, 2, // S
      14, // 词间隔（7×2）
      6, 2, 6, 2, 6, // O
      6, // 字母间隔
      2, 2, 2, 2, 2, // S
    ];
    const out = solve({
      runs: runsFromDurations([...half, 14, ...half]),
      unitMin: 1,
      unitMax: 3,
      alphabet: ['S', 'O'],
      dictionary: ['S', 'OS'],
      readback: true,
    });
    if (out.kind !== 'readback-solved') throw new Error(`expected readback-solved, got ${out.kind}`);
    expect(out.words).toEqual(['S', 'OS']);
    expect(out.text).toBe('S OS');
    expect(out.morse).toBe('... / --- ...');
    expect(out.first.interpretations[5].type).toBe('word');
    expect(out.second.interpretations[5].type).toBe('word');
  });

  it('全序列共同单位与总偏差：分界停顿偏差也计入决胜', () => {
    // 两遍 E（单信号实测 2），分界实测 6：
    //   u=1: 两半各 |2-1|=1 → 共 2；分界 |6-7|=1；总 3
    //   u=2: 两半零偏差；分界 |6-14|=8；总 8
    // 联合决胜选 u=1（总偏差 3），尽管电文本身在 u=2 零偏差。
    const out = solve({
      runs: runsFromDurations([2, 6, 2]),
      unitMin: 1,
      unitMax: 2,
      alphabet: ['E'],
      dictionary: ['E'],
      readback: true,
    });
    if (out.kind !== 'readback-solved') throw new Error(`expected readback-solved, got ${out.kind}`);
    expect(out.unit).toBe(1);
    expect(out.totalDeviation).toBe(3);
  });

  it('未启用回读时不强制相同：同一纸带按原规则译成两个单词', () => {
    const out = solve({ ...SAMPLE_READBACK.input, readback: false });
    if (out.kind !== 'solved') throw new Error(`expected solved, got ${out.kind}`);
    expect(out.text).toBe('SOS SOS');
  });
});

describe('回读一致性 · 失败定位', () => {
  it('样例：两遍同构 SO×2 但非词典完整单词，定位末段且不输出单边电文', () => {
    const out = solve(SAMPLE_READBACK_FAIL.input);
    if (out.kind !== 'readback-no-match') throw new Error(`expected readback-no-match, got ${out.kind}`);
    expect(out.failStage).toBe('pair');
    expect(out.failRunIndex).toBe(10);
    expect(out.reasons.length).toBeGreaterThan(0);
    expect(out.reasons.some((r) => r.includes('完整单词'))).toBe(true);
    // 结果类型本身不包含任何电文/词字段
    expect('words' in out).toBe(false);
    expect('text' in out).toBe(false);
  });

  it('游程总数不是 4m+3：正中为信号游程，分界不能配对', () => {
    const out = solve({
      runs: runsFromDurations([1, 7, 2, 7, 3]),
      unitMin: 1,
      unitMax: 3,
      alphabet: ['E', 'T'],
      dictionary: ['E', 'T'],
      readback: true,
    });
    if (out.kind !== 'readback-no-match') throw new Error(`expected readback-no-match, got ${out.kind}`);
    expect(out.failStage).toBe('divider');
    expect(out.failRunIndex).toBe(2);
    expect(out.reasons.some((r) => r.includes('4m+3'))).toBe(true);
  });

  it('逐段配对失败：两遍同构但单遍拼不出词典完整电文（最早失配字母在半遍末段）', () => {
    // 半遍 5 个信号由符内间隔连成「.....」，字母表只有 {O}（码为 ---）：
    // 中途虽可把 --- 切成 O，但半遍结束时剩余信号组合都不在字母表、
    // 也无法落在词界——两遍最早在此不能配对，且不输出任一单边电文。
    const fiveDots = [2, 2, 2, 2, 2, 2, 2, 2, 2]; // 5 信号 + 4 空白
    const out = solve({
      runs: runsFromDurations([...fiveDots, 14, ...fiveDots]),
      unitMin: 1,
      unitMax: 2,
      alphabet: ['O'],
      dictionary: ['O'],
      readback: true,
    });
    if (out.kind !== 'readback-no-match') throw new Error(`expected readback-no-match, got ${out.kind}`);
    expect(out.failStage).toBe('pair');
    expect(out.failRunIndex).toBe(fiveDots.length - 1);
    expect(out.reasons.length).toBeGreaterThan(0);
  });

  it('词典在受限字母表下无可用单词', () => {
    const out = solve({
      runs: runsFromDurations([...SOS_HALF, 14, ...SOS_HALF]),
      unitMin: 1,
      unitMax: 2,
      alphabet: ['S', 'O'],
      dictionary: ['ABC'],
      readback: true,
    });
    expect(out.kind).toBe('readback-no-match');
  });
});
