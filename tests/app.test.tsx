import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import App from '../src/App';

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
  });
});
