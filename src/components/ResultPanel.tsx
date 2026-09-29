import type {
  ReadbackMismatch,
  Run,
  RunInterpretation,
  SolvedMessage,
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
        {outcome.kind === 'readback-mismatch' && (
          <ReadbackMismatchView outcome={outcome} runs={runs} />
        )}
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

/** 回读不一致：只指出最早不能配对的字母或分界，绝不展示任一单边电文。 */
function ReadbackMismatchView({
  outcome,
  runs,
}: {
  outcome: ReadbackMismatch;
  runs: Run[];
}) {
  const highlight: number[] = [];
  if (outcome.at === 'letter') {
    for (let i = outcome.letterRunStart ?? -1; i <= (outcome.letterRunEnd ?? -2); i++) {
      if (i >= 0) highlight.push(i);
    }
    for (let i = outcome.letterRunStart2 ?? -1; i <= (outcome.letterRunEnd2 ?? -2); i++) {
      if (i >= 0) highlight.push(i);
    }
  } else {
    const center = (runs.length - 1) / 2;
    if (Number.isInteger(center)) highlight.push(center);
  }

  return (
    <div className="card no-solution">
      <h3>✕ 无法形成相同回读</h3>
      <p>
        已在全序列上共同选择整数单位时长、点划 / 停顿解释并联合尝试分界词间停顿，
        <strong>不存在任何分界能让两遍电文在词、字母、摩尔斯码上逐一相同</strong>。
      </p>
      {outcome.at === 'letter' && (
        <p>
          最早不能配对的位置：<strong>第 {(outcome.letterIndex ?? 0) + 1} 个字母</strong>
          （两侧对应游程已在纸带与编辑器中高亮）。
        </p>
      )}
      {outcome.at === 'boundary' && (
        <p>
          分界阶段即失败：没有任何空白游程能作为分界词间停顿，使两侧等长、各自完整译码并完全一致
          （候选分界游程已高亮）。
        </p>
      )}
      <ul>
        {outcome.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      <RunStrip runs={runs} failRunIndices={highlight} />
      <p className="hint">按规程不展示任一单边貌似成功的电文；请核对游程、分界停顿与词典。</p>
    </div>
  );
}

function SolvedView({
  outcome,
  runs,
}: {
  outcome: SolvedMessage;
  runs: Run[];
}) {
  // 累计偏差
  const cumulative: number[] = [];
  outcome.interpretations.reduce((acc, r, i) => {
    const v = acc + r.deviation;
    cumulative[i] = v;
    return v;
  }, 0);

  if (outcome.readbackBoundary) {
    return (
      <ReadbackSolvedView
        outcome={outcome}
        runs={runs}
        cumulative={cumulative}
      />
    );
  }

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

      <CommonMeta outcome={outcome} />

      <p className="morse mono" title="摩尔斯序列（词间以 / 分隔）">
        {outcome.morse}
      </p>

      <RunStrip runs={runs} interpretations={outcome.interpretations} />

      <RunTable runs={runs} outcome={outcome} cumulative={cumulative} />
    </div>
  );
}

/** 共同偏差与单位：两遍电文在同一个单位时长、同一套决胜口径下联合解出。 */
function CommonMeta({ outcome }: { outcome: SolvedMessage }) {
  return (
    <dl className="meta">
      <div>
        <dt>单位时长（两遍共用）</dt>
        <dd>{outcome.unit}</dd>
      </div>
      <div>
        <dt>总绝对偏差（整条纸带）</dt>
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
  );
}

/** 回读一致时的分栏结果：两遍电文、对应游程、分界与共同偏差。 */
function ReadbackSolvedView({
  outcome,
  runs,
  cumulative,
}: {
  outcome: SolvedMessage;
  runs: Run[];
  cumulative: number[];
}) {
  const b = outcome.readbackBoundary!.gapRunIndex;
  const firstRuns = runs.slice(0, b);
  const secondRuns = runs.slice(b + 1);
  const firstInterps = outcome.interpretations.slice(0, b);
  const secondInterps = outcome.interpretations.slice(b + 1);
  const boundaryInterp = outcome.interpretations[b];
  const halfLen = b;

  const halfView = (
    title: string,
    halfRuns: Run[],
    halfInterps: RunInterpretation[],
    runOffset: number,
  ) => (
    <div className="rb-half">
      <h4 className="rb-half-title">{title}</h4>
      <div className="message">
        {outcome.words.map((w, i) => (
          <span key={i} className="word-chip">{w}</span>
        ))}
      </div>
      <p className="morse mono">{outcome.morse}</p>
      <RunStrip runs={halfRuns} interpretations={halfInterps} />
      <table className="run-table rb-run-table">
        <thead>
          <tr>
            <th>全局#</th>
            <th>类型</th>
            <th>实测</th>
            <th>解释</th>
            <th>目标</th>
            <th>偏差</th>
          </tr>
        </thead>
        <tbody>
          {halfRuns.map((run, i) => {
            const it = halfInterps[i];
            const globalIndex = runOffset + i;
            return (
              <tr key={i} className={it.type === 'word' ? 'row-word' : ''}>
                <td className="hint-inline">{globalIndex + 1}</td>
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="card solved">
      <h3>✓ 复原成功 · 回读一致</h3>
      <p className="hint rb-intro">
        两遍电文在词、字母、摩尔斯码各层完全相同；单位时长、全部点划 / 停顿解释与分界
        在同一次联合求解中共同确定，一致性仅作为可行性约束。
      </p>

      <CommonMeta outcome={outcome} />

      <div className="rb-columns">
        {halfView('第一遍电文', firstRuns, firstInterps, 0)}

        <div className="rb-boundary-col">
          <div className="rb-boundary" title={`第 ${b + 1} 段空白游程被解释为词间停顿`}>
            <span className="rb-boundary-label">分界</span>
            <b>词间隔 ₇</b>
            <i>第 {b + 1} 段 · 实测 {runs[b].duration}</i>
            <i>
              目标 {fmt(boundaryInterp.target)}（7×{outcome.unit}）· 偏差{' '}
              {fmt(boundaryInterp.deviation)}
            </i>
          </div>
        </div>

        {halfView('第二遍电文', secondRuns, secondInterps, b + 1)}
      </div>

      <h4 className="rb-table-title">对应游程逐段比较（同一局部位置两侧同结构）</h4>
      <table className="run-table rb-pair-table">
        <thead>
          <tr>
            <th colSpan={6}>第一遍</th>
            <th className="rb-pair-sep">#</th>
            <th colSpan={6}>第二遍</th>
          </tr>
          <tr>
            <th>全局#</th><th>类型</th><th>实测</th><th>解释</th><th>目标</th><th>偏差</th>
            <th className="rb-pair-sep">局部</th>
            <th>全局#</th><th>类型</th><th>实测</th><th>解释</th><th>目标</th><th>偏差</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: halfLen }, (_, i) => {
            const r1 = firstRuns[i];
            const r2 = secondRuns[i];
            const i1 = firstInterps[i];
            const i2 = secondInterps[i];
            // 可行回读中两侧解释类别必然相同：相同字母意味着相同摩尔斯符号序列，
            // 配对 DP 又强制同位置停顿同类别——此表逐段直观核对这一一致性。
            return (
              <tr key={i} className={i1.type === 'word' || i2.type === 'word' ? 'row-word' : ''}>
                <td className="hint-inline">{i + 1}</td>
                <td>{r1.kind === 'signal' ? '信号' : '空白'}</td>
                <td>{r1.duration}</td>
                <td>{i1.label}</td>
                <td>{fmt(i1.target)}</td>
                <td>{fmt(i1.deviation)}</td>
                <td className="rb-pair-sep">{i + 1}</td>
                <td className="hint-inline">{b + 2 + i}</td>
                <td>{r2.kind === 'signal' ? '信号' : '空白'}</td>
                <td>{r2.duration}</td>
                <td>{i2.label}</td>
                <td>{fmt(i2.target)}</td>
                <td>{fmt(i2.deviation)}</td>
              </tr>
            );
          })}
          <tr className="rb-boundary-row">
            <td colSpan={6} className="rb-boundary-cell">
              分界词间停顿：第 {b + 1} 段空白游程，目标 {fmt(boundaryInterp.target)}，
              偏差 {fmt(boundaryInterp.deviation)}
            </td>
            <td className="rb-pair-sep">₇</td>
            <td colSpan={6} className="rb-boundary-cell">
              两遍电文由此分隔；该段计入共同总偏差
            </td>
          </tr>
        </tbody>
      </table>

      <details className="rb-full-details">
        <summary>查看整条纸带的逐段解释与累计偏差（{runs.length} 段）</summary>
        <RunTable runs={runs} outcome={outcome} cumulative={cumulative} />
      </details>
    </div>
  );
}

function RunTable({
  runs,
  outcome,
  cumulative,
}: {
  runs: Run[];
  outcome: SolvedMessage;
  cumulative: number[];
}) {
  return (
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
  );
}
