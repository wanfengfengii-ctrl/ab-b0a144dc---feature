import type { Run } from '../core/types';

interface Props {
  runs: Run[];
  /** 无解 / 失配时需要高亮的游程下标（0 起始，可多个）；无则为空数组。 */
  failRunIndices: number[];
  onChange: (runs: Run[]) => void;
}

/**
 * 游程编辑器：纸带以信号开始、明暗交替、以信号结束。
 * 支持逐段修改时长、末尾追加/删除“空白+信号”一对游程。
 */
export function RunEditor({ runs, failRunIndices, onChange }: Props) {
  const failSet = new Set(failRunIndices);
  const firstFail = failRunIndices.length > 0 ? failRunIndices[0] : null;
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
              failSet.has(i) ? ' run-fail' : ''
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
      {firstFail !== null && (
        <p className="hint error">
          第 {firstFail + 1} 段{failRunIndices.length > 1 ? '（及其配对侧对应字母游程）' : ''}
          是最早不能配对 / 无法落入有效词典前缀的位置。
        </p>
      )}
    </div>
  );
}
