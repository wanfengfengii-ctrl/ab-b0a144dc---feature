import type { Run, RunInterpretation } from '../core/types';

interface Props {
  runs: Run[];
  /** 每段解释（已解出时提供，与 runs 等长同序）。 */
  interpretations?: RunInterpretation[] | null;
  /** 最早无法译码的游程下标（0 起始）；其后的游程不再可信，降灰显示。 */
  failRunIndex?: number | null;
}

const GAP_SYMBOL: Record<string, string> = { intra: '₁', letter: '₃', word: '₇' };

/**
 * 纸带游程条：逐段展示解释结果、词界与未能译码的位置。
 */
export function RunStrip({ runs, interpretations = null, failRunIndex = null }: Props) {
  return (
    <div className="strip-wrap">
      <div className="strip" role="list" aria-label="游程解释条">
        {runs.map((run, i) => {
          const interp = interpretations?.[i] ?? null;
          const failed = failRunIndex !== null && i === failRunIndex;
          const dimmed = failRunIndex !== null && i > failRunIndex;
          const cls = [
            'chip',
            failed
              ? 'chip-fail'
              : interp
                ? `chip-${interp.type}`
                : run.kind === 'signal'
                  ? 'chip-raw-signal'
                  : 'chip-raw-gap',
            dimmed ? 'chip-dim' : '',
          ].join(' ');
          const symbol = failed
            ? '✕'
            : interp
              ? run.kind === 'signal'
                ? interp.type === 'dot'
                  ? '·'
                  : '−'
                : GAP_SYMBOL[interp.type]
              : run.kind === 'signal'
                ? '●'
                : '◌';
          const title = interp
            ? `第 ${i + 1} 段：${interp.label}，目标 ${interp.target}，偏差 ${interp.deviation}`
            : `第 ${i + 1} 段：${run.kind === 'signal' ? '信号' : '空白'}，时长 ${run.duration}`;
          return (
            <span key={i} className="strip-item" role="listitem">
              <span className={cls} title={title}>
                <b>{symbol}</b>
                <i>{run.duration}</i>
              </span>
              {interp?.type === 'word' && <span className="word-bound">词界</span>}
            </span>
          );
        })}
      </div>
      <div className="legend">
        <span><i className="dot dot-signal" /> 点 / 划（信号）</span>
        <span><i className="dot dot-intra" /> 符内 ₁</span>
        <span><i className="dot dot-letter" /> 字母间隔 ₃</span>
        <span><i className="dot dot-word" /> 词间隔 ₇（词界）</span>
        <span><i className="dot dot-fail" /> 无法译码位置</span>
      </div>
    </div>
  );
}
