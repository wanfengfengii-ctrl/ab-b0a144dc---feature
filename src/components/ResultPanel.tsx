import type {
  ReadbackNoMatch,
  ReadbackSolved,
  Run,
  RunInterpretation,
  SolveOutcome,
} from '../core/types';
import { RunStrip } from './RunStrip';

interface Props {
  outcome: SolveOutcome;
  /** 草稿已被修改：旧电文立即失效。 */
  stale: boolean;
  /** 求解时的纸带快照。 */
  runs: Run[];
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function ResultPanel({ outcome, stale, runs }: Props) {
  return (
    <div className="result">
      {stale && (
        <div className="stale-banner" role="alert">
          ⚠ 草稿已修改 —— 以下电文已失效，请重新点击「复原电文」。
        </div>
      )}
      <div className={stale ? 'result-body stale' : 'result-body'}>
        {outcome.kind === 'invalid' && <InvalidView errors={outcome.errors} />}
        {outcome.kind === 'no-solution' && <NoSolutionView outcome={outcome} runs={runs} />}
        {outcome.kind === 'readback-no-match' && (
          <ReadbackNoMatchView outcome={outcome} runs={runs} />
        )}
        {outcome.kind === 'solved' && <SolvedView outcome={outcome} runs={runs} />}
        {outcome.kind === 'readback-solved' && (
          <ReadbackSolvedView outcome={outcome} runs={runs} />
        )}
      </div>
    </div>
  );
}

function InvalidView({ errors }: { errors: string[] }) {
  return (
    <div className="card invalid">
      <h3>输入不合法</h3>
      <ul>
        {errors.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
    </div>
  );
}

function NoSolutionView({
  outcome,
  runs,
}: {
  outcome: Extract<SolveOutcome, { kind: 'no-solution' }>;
  runs: Run[];
}) {
  const fail = runs[outcome.failRunIndex];
  return (
    <div className="card no-solution">
      <h3>✕ 无法复原电文</h3>
      <p>
        最早无法落入任何有效词典前缀的位置：
        <strong>
          第 {outcome.failRunIndex + 1} 段（
          {fail ? (fail.kind === 'signal' ? '信号' : '空白') : '—'}游程，实测时长{' '}
          {fail ? fail.duration : '—'}）
        </strong>
      </p>
      <ul>
        {outcome.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      <RunStrip runs={runs} failRunIndex={outcome.failRunIndex} />
      <p className="hint">按规程不输出貌似完整的电文；请核对游程录入、单位范围、字母表与词典。</p>
    </div>
  );
}

/** 回读失败：指出最早不能配对的字母位置或分界，不显示任一单边电文。 */
function ReadbackNoMatchView({ outcome, runs }: { outcome: ReadbackNoMatch; runs: Run[] }) {
  const fail = runs[outcome.failRunIndex];
  return (
    <div className="card no-solution">
      <h3>✕ 无法形成相同回读</h3>
      <p>
        {outcome.failStage === 'divider' ? '最早不能配对的是分界停顿：' : '最早不能配对的位置：'}
        <strong>
          第 {outcome.failRunIndex + 1} 段（
          {fail ? (fail.kind === 'signal' ? '信号' : '空白') : '—'}游程，实测时长{' '}
          {fail ? fail.duration : '—'}）
        </strong>
      </p>
      <ul>
        {outcome.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      <RunStrip runs={runs} failRunIndex={outcome.failRunIndex} />
      <p className="hint">
        按规程不输出任一单边貌似成功的电文；请核对纸带是否确为同一段电文连发两遍、分界词间停顿与录入数据。
      </p>
    </div>
  );
}

function SolvedView({
  outcome,
  runs,
}: {
  outcome: Extract<SolveOutcome, { kind: 'solved' }>;
  runs: Run[];
}) {
  // 累计偏差
  const cumulative: number[] = [];
  outcome.interpretations.reduce((acc, r, i) => {
    const v = acc + r.deviation;
    cumulative[i] = v;
    return v;
  }, 0);

  return (
    <div className="card solved">
      <h3>✓ 复原成功</h3>

      <div className="message">
        {outcome.words.map((w, i) => (
          <span key={i} className="word-chip">
            {w}
          </span>
        ))}
      </div>

      <dl className="meta">
        <div>
          <dt>单位时长</dt>
          <dd>{outcome.unit}</dd>
        </div>
        <div>
          <dt>总绝对偏差</dt>
          <dd>{fmt(outcome.totalDeviation)}</dd>
        </div>
        <div>
          <dt>单段最大偏差</dt>
          <dd>{fmt(outcome.maxDeviation)}</dd>
        </div>
        <div>
          <dt>稳定编码</dt>
          <dd className="mono">{outcome.encoding}</dd>
        </div>
      </dl>

      <p className="morse mono" title="摩尔斯序列（词间以 / 分隔）">
        {outcome.morse}
      </p>

      <RunStrip runs={runs} interpretations={outcome.interpretations} />

      <table className="run-table">
        <thead>
          <tr>
            <th>#</th>
            <th>类型</th>
            <th>实测时长</th>
            <th>解释</th>
            <th>目标时长</th>
            <th>偏差</th>
            <th>累计偏差</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run, i) => {
            const it = outcome.interpretations[i];
            return (
              <tr key={i} className={it.type === 'word' ? 'row-word' : ''}>
                <td>{i + 1}</td>
                <td>{run.kind === 'signal' ? '信号' : '空白'}</td>
                <td>{run.duration}</td>
                <td>
                  {it.label}
                  {it.type === 'word' && <span className="badge">词界</span>}
                </td>
                <td>
                  {fmt(it.target)}
                  <span className="hint-inline">（{it.targetUnits}×{outcome.unit}）</span>
                </td>
                <td>{fmt(it.deviation)}</td>
                <td>{fmt(cumulative[i])}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 回读一致性成功：分栏呈现两遍电文、对应游程、分界与共同偏差。 */
function ReadbackSolvedView({ outcome, runs }: { outcome: ReadbackSolved; runs: Run[] }) {
  const halfCols: Array<{
    title: string;
    startIndex: number;
    interps: RunInterpretation[];
  }> = [
    { title: '第一遍电文', startIndex: 0, interps: outcome.first.interpretations },
    { title: '第二遍电文', startIndex: outcome.second.startIndex, interps: outcome.second.interpretations },
  ];

  const halfSubtotal = (interps: RunInterpretation[]): number =>
    interps.reduce((s, it) => s + it.deviation, 0);

  return (
    <div className="card solved readback-card">
      <h3>✓ 回读一致 · 两遍电文完全相同</h3>

      <div className="message">
        {outcome.words.map((w, i) => (
          <span key={i} className="word-chip">
            {w}
          </span>
        ))}
      </div>
      <p className="morse mono" title="单遍摩尔斯序列（两遍相同）">
        {outcome.morse}
      </p>

      <dl className="meta">
        <div>
          <dt>共同单位时长</dt>
          <dd>{outcome.unit}</dd>
        </div>
        <div>
          <dt>全序列总绝对偏差</dt>
          <dd>{fmt(outcome.totalDeviation)}</dd>
        </div>
        <div>
          <dt>单段最大偏差</dt>
          <dd>{fmt(outcome.maxDeviation)}</dd>
        </div>
        <div>
          <dt>分界词间停顿</dt>
          <dd>
            第 {outcome.dividerRunIndex + 1} 段
            <span className="hint-inline">
              （实测 {runs[outcome.dividerRunIndex].duration} / 目标 {fmt(outcome.divider.target)}，
              偏差 {fmt(outcome.divider.deviation)}）
            </span>
          </dd>
        </div>
      </dl>

      <div className="readback-cols">
        {halfCols.map((col) => (
          <div className="readback-col" key={col.title}>
            <h4>{col.title}</h4>
            <div className="message">
              {outcome.words.map((w, i) => (
                <span key={i} className="word-chip">
                  {w}
                </span>
              ))}
            </div>
            <p className="morse mono readback-morse" title="该遍摩尔斯序列（两遍相同）">
              {outcome.morse}
            </p>
            <RunStrip runs={runs.slice(col.startIndex, col.startIndex + col.interps.length)} interpretations={col.interps} />
            <p className="hint readback-subtotal">
              本遍游程 {col.interps.length} 段 · 偏差小计 {fmt(halfSubtotal(col.interps))}
            </p>
            <table className="run-table compact">
              <thead>
                <tr>
                  <th>纸带#</th>
                  <th>实测</th>
                  <th>解释</th>
                  <th>目标</th>
                  <th>偏差</th>
                </tr>
              </thead>
              <tbody>
                {col.interps.map((it, j) => {
                  const globalIndex = col.startIndex + j;
                  return (
                    <tr key={j} className={it.type === 'word' ? 'row-word' : ''}>
                      <td>{globalIndex + 1}</td>
                      <td>{runs[globalIndex].duration}</td>
                      <td>
                        {it.label}
                        {it.type === 'word' && <span className="badge">词界</span>}
                      </td>
                      <td>{fmt(it.target)}</td>
                      <td>{fmt(it.deviation)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="readback-divider-row">
        <span className="divider-mark">⇄ 分界</span>
        <span>
          第 {outcome.dividerRunIndex + 1} 段空白游程解释为<strong>词间停顿</strong>
          （7×{outcome.unit}={fmt(outcome.divider.target)}），两遍共用同一套点划/停顿解释，
          词、字母与摩尔斯码逐个相同。
        </span>
      </div>

      <details className="readback-full">
        <summary>查看全序列游程条（第一遍 · 分界停顿 · 第二遍）</summary>
        <RunStrip
          runs={runs}
          interpretations={[
            ...outcome.first.interpretations,
            outcome.divider,
            ...outcome.second.interpretations,
          ]}
        />
      </details>

      <p className="hint">
        全序列稳定编码：<span className="mono">{outcome.encoding}</span>
        （结构为「单遍编码 · 2（分界词停顿）· 同一单遍编码」）
      </p>
    </div>
  );
}
