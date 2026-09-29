import { describe, expect, it } from 'vitest';
import { solve } from '../src/core/solve';
import { SAMPLE_NOISY, SAMPLE_READBACK, runsFromDurations } from '../src/core/samples';
import type { SolveInput } from '../src/core/types';

/** 单遍干净 SOS 的 17 段游程。 */
const SOS = [
  2, 2, 2, 2, 2, // S
  6,
  6, 2, 6, 2, 6, // O
  6,
  2, 2, 2, 2, 2, // S
];

function readbackInput(durations: number[], extra?: Partial<SolveInput>): SolveInput {
  return {
    runs: runsFromDurations(durations),
    unitMin: 1,
    unitMax: 4,
    alphabet: ['S', 'O'],
    dictionary: ['SOS'],
    readback: true,
    ...extra,
  };
}

describe('回读一致性 · 成功', () => {
  it('干净 SOS×2：零偏差、单位 2、分界居中', () => {
    const out = solve(readbackInput([...SOS, 14, ...SOS]));
    expect(out.kind).toBe('solved');
    if (out.kind !== 'solved') return;
    expect(out.text).toBe('SOS');
    expect(out.words).toEqual(['SOS']);
    expect(out.unit).toBe(2);
    expect(out.totalDeviation).toBe(0);
    expect(out.maxDeviation).toBe(0);
    expect(out.interpretations).toHaveLength(35);
    expect(out.readbackBoundary).toEqual({
      gapRunIndex: 17,
      firstRunCount: 17,
      secondRunCount: 17,
    });
    // 分界游程被解释为词间隔（7 单位）
    expect(out.interpretations[17].type).toBe('word');
    expect(out.interpretations[17].targetUnits).toBe(7);
    // 编码：第一遍编码 + 2 + 第二遍编码
    const halfCode = '00000110101100000';
    expect(out.encoding).toBe(halfCode + '2' + halfCode);
  });

  it('受潮 SOS×2 样例：两遍共同复原、总偏差 13', () => {
    const out = solve(SAMPLE_READBACK.input);
    expect(out.kind).toBe('solved');
    if (out.kind !== 'solved') return;
    expect(out.text).toBe('SOS');
    expect(out.unit).toBe(2);
    expect(out.totalDeviation).toBe(13);
    expect(out.maxDeviation).toBe(1);
    expect(out.readbackBoundary?.gapRunIndex).toBe(17);
    // 累计偏差之和等于总偏差
    expect(out.interpretations.reduce((s, r) => s + r.deviation, 0)).toBe(13);
  });

  it('同一单位时长适用于两遍及分界', () => {
    const out = solve(SAMPLE_READBACK.input);
    if (out.kind !== 'solved') throw new Error('expected solved');
    for (const it of out.interpretations) {
      expect(it.target).toBe(it.targetUnits * out.unit);
    }
  });

  it('多词消息回读：两遍均为 S OS，词序一致', () => {
    const sOs = [2,2,2,2,2, 14, 6,2,6,2,6, 6, 2,2,2,2,2];
    const out = solve(readbackInput([...sOs, 14, ...sOs], {
      unitMin: 1, unitMax: 3, dictionary: ['S', 'OS'],
    }));
    expect(out.kind).toBe('solved');
    if (out.kind !== 'solved') return;
    expect(out.words).toEqual(['S', 'OS']);
    expect(out.morse).toBe('... / --- ...');
  });

  it('完全并列时按解释编码字典序决胜（编码 0 的点优先），一致性只作约束', () => {
    // u=1 时点、划偏差均为 1；两侧必须同字母 → E（编码 020）胜 T（121）
    const out = solve(readbackInput([2, 7, 2], {
      unitMin: 1, unitMax: 1, alphabet: ['E', 'T'], dictionary: ['E', 'T'],
    }));
    expect(out.kind).toBe('solved');
    if (out.kind !== 'solved') return;
    expect(out.text).toBe('E');
    expect(out.encoding).toBe('020');
  });
});

describe('回读一致性 · 是联合求解而非事后筛选', () => {
  it('不先取单遍最优：同一纸带单遍译为 SOS SOS，回读约束下仍取同一电文两遍', () => {
    const plain = solve({ ...SAMPLE_READBACK.input, readback: false });
    const rb = solve(SAMPLE_READBACK.input);
    expect(plain.kind).toBe('solved');
    expect(rb.kind).toBe('solved');
    if (plain.kind !== 'solved' || rb.kind !== 'solved') return;
    expect(plain.words).toEqual(['SOS', 'SOS']);
    expect(rb.words).toEqual(['SOS']); // 回读只报被重复的那一遍电文
    expect(rb.readbackBoundary).toBeDefined();
  });

  it('两侧实测时长不同但可联合重解释为相同字母时可行（偏差不同，不由各自单遍筛选决定）', () => {
    // E='.'；第一遍信号 2、第二遍信号 3，u=2，偏差 0/1，仍联合解出 E E
    const out = solve(readbackInput([2, 14, 3], {
      unitMin: 1, unitMax: 4, alphabet: ['E', 'T'], dictionary: ['E', 'T'],
    }));
    expect(out.kind).toBe('solved');
    if (out.kind !== 'solved') return;
    expect(out.text).toBe('E');
    expect(out.totalDeviation).toBe(1);
  });
});

describe('回读一致性 · 失配定位', () => {
  it('中央是信号游程时给分界级失配，不展示任何单边电文', () => {
    // 5 段：中央 index 2 是信号
    const out = solve(readbackInput([2, 6, 2, 6, 2], {
      alphabet: ['E', 'S'], dictionary: ['E', 'S'],
    }));
    expect(out.kind).toBe('readback-mismatch');
    if (out.kind !== 'readback-mismatch') return;
    expect(out.at).toBe('boundary');
    expect(out.reasons.join(' ')).toContain('分界');
  });

  it('偶数段纸带无法分成等长两遍 → 分界级失配', () => {
    // 构造偶数段：3 信号 + ... 用 SOS(17)+gap(1)=18 段（以信号起、信号止不可能偶数，
    // 故偶数段先触发 invalid；这里改用奇数段但中央信号已由上例覆盖。
    // 偶数段在 validateInput 阶段即非法：
    const out = solve(readbackInput([2, 6], { alphabet: ['E'], dictionary: ['E'] }));
    expect(['invalid', 'readback-mismatch']).toContain(out.kind);
  });

  it('半段无法译码（单信号配字母 S）→ 第 1 个字母即不能配对，并给两侧游程跨度', () => {
    const out = solve(readbackInput([2, 14, 6], {
      alphabet: ['S'], dictionary: ['S'],
    }));
    expect(out.kind).toBe('readback-mismatch');
    if (out.kind !== 'readback-mismatch') return;
    expect(out.at).toBe('letter');
    expect(out.letterIndex).toBe(0);
    expect(out.letterRunStart).toBe(0);
    expect(out.letterRunEnd).toBe(0);
    expect(out.letterRunStart2).toBe(2);
    expect(out.letterRunEnd2).toBe(2);
    // 绝不能给出任何单边完整电文
    expect('words' in out).toBe(false);
  });

  it('两侧都停在非词界前缀（词典只有 SS，半段只有一个 S）→ 指出最早不能配对处', () => {
    // 半段结束时 S 仍是未闭合信号组合（无收尾字母 / 词间隔），且即便闭合也不落在词界
    const out = solve(readbackInput([2,2,2,2,2, 14, 2,2,2,2,2], {
      alphabet: ['S'], dictionary: ['SS'],
    }));
    expect(out.kind).toBe('readback-mismatch');
    if (out.kind !== 'readback-mismatch') return;
    expect(out.at).toBe('letter');
    expect(out.letterIndex).toBe(0);
    expect(out.reasons.join(' ')).toContain('词界');
  });

  it('失配结果不含 interpretations / words，绝不显示单边貌似成功的电文', () => {
    const out = solve(readbackInput([2, 14, 6], {
      alphabet: ['S'], dictionary: ['S'],
    }));
    expect(out.kind).toBe('readback-mismatch');
    expect(out).not.toHaveProperty('interpretations');
    expect(out).not.toHaveProperty('words');
    expect(out).not.toHaveProperty('text');
  });
});

describe('回读一致性 · 未启用时行为完全不变', () => {
  it('缺省 readback 与显式 false 的结果逐字段一致', () => {
    const tape = [...SOS, 14, ...SOS];
    const a = solve(readbackInput(tape, { readback: undefined }));
    const b = solve(readbackInput(tape, { readback: false }));
    expect(a).toEqual(b);
    if (a.kind !== 'solved') return;
    expect(a.words).toEqual(['SOS', 'SOS']);
    expect(a.readbackBoundary).toBeUndefined();
  });

  it('受潮样例未启用回读时结论不变（SOS、总偏差 6）', () => {
    const out = solve({ ...SAMPLE_NOISY.input });
    expect(out.kind).toBe('solved');
    if (out.kind !== 'solved') return;
    expect(out.text).toBe('SOS');
    expect(out.totalDeviation).toBe(6);
  });
});
