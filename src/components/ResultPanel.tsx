import type { Run, SolveOutcome } from '../core/types';
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
        {outcome.kind === 'solved' && <SolvedView outcome={outcome} runs={runs} />}
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
