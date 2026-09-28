import { describe, expect, it } from 'vitest';
import { solve, usableWords, validateInput } from '../src/core/solve';
import {
  SAMPLE_BROKEN,
  SAMPLE_CLEAN,
  SAMPLE_NOISY,
  runsFromDurations,
} from '../src/core/samples';
import type { SolveInput } from '../src/core/types';

function solvedText(input: SolveInput) {
  const out = solve(input);
  if (out.kind !== 'solved') throw new Error(`expected solved, got ${out.kind}`);
  return out;
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
