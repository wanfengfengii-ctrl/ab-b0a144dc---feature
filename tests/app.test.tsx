import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import App from '../src/App';
import { ResultPanel } from '../src/components/ResultPanel';
import { solve } from '../src/core/solve';
import { SAMPLE_READBACK, SAMPLE_READBACK_FAIL } from '../src/core/samples';

describe('App 渲染冒烟', () => {
  it('首屏渲染出编辑器与已复原的电文（默认受潮样例）', () => {
    const html = renderToString(createElement(App));
    // 编辑器区块
    expect(html).toContain('纸带游程');
    expect(html).toContain('单位时长范围');
    expect(html).toContain('受限字母表');
    expect(html).toContain('词典');
    // 默认样例应自动复原出 SOS
    expect(html).toContain('复原成功');
    expect(html).toContain('SOS');
    // 每段解释与累计偏差表
    expect(html).toContain('累计偏差');
    expect(html).toContain('符内间隔');
    // 回读一致性开关（未启用时旧结果与样例保持原样）
    expect(html).toContain('回读一致性');
  });
});

describe('回读结果渲染冒烟', () => {
  it('成功：分栏呈现两遍电文、对应游程、分界与共同偏差', () => {
    const outcome = solve(SAMPLE_READBACK.input);
    if (outcome.kind !== 'readback-solved') throw new Error(`expected readback-solved, got ${outcome.kind}`);
    const html = renderToString(
      createElement(ResultPanel, { outcome, stale: false, runs: SAMPLE_READBACK.input.runs }),
    );
    expect(html).toContain('回读一致');
    expect(html).toContain('第一遍电文');
    expect(html).toContain('第二遍电文');
    expect(html).toContain('分界');
    expect(html).toContain('共同单位时长');
    expect(html).toContain('全序列总绝对偏差');
    // 两栏各渲染一条 17 段游程条（共 ≥34 个游程格），摩尔斯码相同
    expect(html.match(/strip-item/g)?.length).toBeGreaterThanOrEqual(34);
    expect(html).toContain('... --- ...');
    // 两栏明细表分别覆盖纸带第 1 段与最后一段
    expect(html).toContain('>1<');
    expect(html).toContain('>35<');
  });

  it('失败：指出最早不能配对的字母，且不显示任一单边电文', () => {
    const outcome = solve(SAMPLE_READBACK_FAIL.input);
    if (outcome.kind !== 'readback-no-match') {
      throw new Error(`expected readback-no-match, got ${outcome.kind}`);
    }
    const html = renderToString(
      createElement(ResultPanel, { outcome, stale: false, runs: SAMPLE_READBACK_FAIL.input.runs }),
    );
    expect(html).toContain('无法形成相同回读');
    expect(html).toContain('不输出任一单边貌似成功的电文');
    expect(html).not.toContain('复原成功');
  });
});
