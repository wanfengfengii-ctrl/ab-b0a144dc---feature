import type { Run } from '../core/types';

interface Props {
  runs: Run[];
  /** 无解时最早失败的游程下标（0 起始），用于高亮；无则为 null。 */
  failRunIndex: number | null;
  onChange: (runs: Run[]) => void;
}

/**
 * 游程编辑器：纸带以信号开始、明暗交替、以信号结束。
 * 支持逐段修改时长、末尾追加/删除“空白+信号”一对游程。
 */
export function RunEditor({ runs, failRunIndex, onChange }: Props) {
  const setDuration = (i: number, raw: string) => {
    const duration = Number(raw);
    onChange(runs.map((r, j) => (j === i ? { ...r, duration } : r)));
  };

  const appendPair = () =>
    onChange([...runs, { kind: 'gap', duration: 2 }, { kind: 'signal', duration: 2 }]);

  const removePair = () => {
    if (runs.length >= 3) onChange(runs.slice(0, -2));
  };

  return (
    <div className="run-editor">
      <div className="run-grid" role="table" aria-label="纸带游程">
        <div className="run-row run-head" role="row">
          <span>#</span>
          <span>类型</span>
          <span>实测时长</span>
        </div>
        {runs.map((run, i) => (
          <div
            key={i}
            role="row"
            className={`run-row ${run.kind === 'signal' ? 'run-signal' : 'run-gap'}${
              i === failRunIndex ? ' run-fail' : ''
            }`}
          >
            <span className="run-index">{i + 1}</span>
            <span className="run-kind">{run.kind === 'signal' ? '信号' : '空白'}</span>
            <span>
              <input
                type="number"
                min={0}
                step="any"
                value={run.duration}
                onChange={(e) => setDuration(i, e.target.value)}
                aria-label={`第 ${i + 1} 段时长`}
              />
            </span>
          </div>
        ))}
      </div>
      <div className="run-controls">
        <button className="ghost" onClick={appendPair}>
          ＋ 追加空白+信号
        </button>
        <button className="ghost" onClick={removePair} disabled={runs.length < 3}>
          － 删除末尾两段
        </button>
      </div>
      {failRunIndex !== null && (
        <p className="hint error">第 {failRunIndex + 1} 段是最早无法落入有效词典前缀的位置。</p>
      )}
    </div>
  );
}
