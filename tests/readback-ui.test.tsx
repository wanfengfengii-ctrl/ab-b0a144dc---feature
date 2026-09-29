import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { solve } from '../src/core/solve';
import { SAMPLE_READBACK, runsFromDurations } from '../src/core/samples';
import { ResultPanel } from '../src/components/ResultPanel';

describe('回读结果渲染冒烟', () => {
  it('成功：分栏呈现两遍电文、分界与共同偏差', () => {
    const outcome = solve(SAMPLE_READBACK.input);
    expect(outcome.kind).toBe('solved');
    const html = renderToString(
      createElement(ResultPanel, { outcome, stale: false, runs: SAMPLE_READBACK.input.runs }),
    );
    expect(html).toContain('回读一致');
    expect(html).toContain('第一遍电文');
    expect(html).toContain('第二遍电文');
    expect(html).toContain('分界');
    // 两遍都出现 SOS 词块
    expect(html.match(/SOS/g)?.length).toBeGreaterThanOrEqual(2);
    // 共同偏差
    expect(html).toContain('13');
    // 对应游程比较表
    expect(html).toContain('对应游程逐段比较');
  });

  it('失配：不显示任何单边电文，只报告不能配对的字母', () => {
    const outcome = solve({
      runs: runsFromDurations([2, 14, 6]),
      unitMin: 1,
      unitMax: 4,
      alphabet: ['S'],
      dictionary: ['S'],
      readback: true,
    });
    expect(outcome.kind).toBe('readback-mismatch');
    const html = renderToString(
      createElement(ResultPanel, { outcome, stale: false, runs: runsFromDurations([2, 14, 6]) }),
    );
    expect(html).toContain('无法形成相同回读');
    expect(html).toContain('不能配对');
    expect(html).not.toContain('复原成功');
  });

  it('失效（stale）时仍展示横幅', () => {
    const outcome = solve(SAMPLE_READBACK.input);
    const html = renderToString(
      createElement(ResultPanel, { outcome, stale: true, runs: SAMPLE_READBACK.input.runs }),
    );
    expect(html).toContain('草稿已修改');
  });
});
