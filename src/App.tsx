import { useMemo, useState } from 'react';
import { ignoredWords, solve } from './core/solve';
import { SAMPLE_NOISY, SAMPLES, type SampleDef } from './core/samples';
import type { Run, SolveOutcome } from './core/types';
import { RunEditor } from './components/RunEditor';
import { ResultPanel } from './components/ResultPanel';

/** 草稿：页面上一切可编辑内容。任何改动都会使已复原的电文立即失效。 */
interface Draft {
  runs: Run[];
  unitMin: number;
  unitMax: number;
  alphabetText: string;
  dictText: string;
}

function parseAlphabet(text: string): string[] {
  const seen = new Set<string>();
  for (const ch of text.toUpperCase()) {
    if (/^[A-Z]$/.test(ch)) seen.add(ch);
  }
  return [...seen];
}

function parseDictionary(text: string): string[] {
  return text
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean);
}

function fingerprint(d: Draft): string {
  return JSON.stringify(d);
}

function loadSample(s: SampleDef): Draft {
  return {
    runs: s.input.runs.map((r) => ({ ...r })),
    unitMin: s.input.unitMin,
    unitMax: s.input.unitMax,
    alphabetText: s.input.alphabet.join(''),
    dictText: s.input.dictionary.join(' '),
  };
}

function solveDraft(draft: Draft): SolveOutcome {
  return solve({
    runs: draft.runs,
    unitMin: draft.unitMin,
    unitMax: draft.unitMax,
    alphabet: parseAlphabet(draft.alphabetText),
    dictionary: parseDictionary(draft.dictText),
  });
}

export default function App() {
  const [draft, setDraft] = useState<Draft>(() => loadSample(SAMPLE_NOISY));
  // 结果与求解时的草稿指纹、纸带快照绑定；草稿任一改动都会使指纹失配 → 电文失效。
  const [result, setResult] = useState<{
    fingerprint: string;
    outcome: SolveOutcome;
    runs: Run[];
  }>(() => {
    const initial = loadSample(SAMPLE_NOISY);
    return { fingerprint: fingerprint(initial), outcome: solveDraft(initial), runs: initial.runs };
  });

  const stale = result.fingerprint !== fingerprint(draft);

  const failRunIndex =
    !stale && result.outcome.kind === 'no-solution' ? result.outcome.failRunIndex : null;

  const ignored = useMemo(
    () => ignoredWords(parseAlphabet(draft.alphabetText), parseDictionary(draft.dictText)),
    [draft.alphabetText, draft.dictText],
  );

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  const doSolve = () =>
    setResult({ fingerprint: fingerprint(draft), outcome: solveDraft(draft), runs: draft.runs });

  return (
    <div className="app">
      <header className="app-header">
        <h1>极地救援站 · 摩尔斯纸带复原</h1>
        <p>
          录入受潮纸带的明暗游程与允许的单位时长范围，在整个序列上共同选择整数单位时长与各段解释，
          复原受限字母表与词典下的呼救电文。
        </p>
      </header>

      <main className="layout">
        <section className="panel">
          <h2>① 纸带游程（按出现顺序，明暗交替）</h2>
          <RunEditor
            runs={draft.runs}
            failRunIndex={failRunIndex}
            onChange={(runs) => patch({ runs })}
          />

          <h2>② 单位时长范围（整数）</h2>
          <div className="field-row">
            <label>
              下限
              <input
                type="number"
                min={1}
                step={1}
                value={draft.unitMin}
                onChange={(e) => patch({ unitMin: Number(e.target.value) })}
              />
            </label>
            <label>
              上限
              <input
                type="number"
                min={1}
                step={1}
                value={draft.unitMax}
                onChange={(e) => patch({ unitMax: Number(e.target.value) })}
              />
            </label>
          </div>

          <h2>③ 受限字母表</h2>
          <input
            className="text-input mono"
            value={draft.alphabetText}
            onChange={(e) => patch({ alphabetText: e.target.value })}
            placeholder="例如 SOS"
            spellCheck={false}
          />
          <p className="hint">仅保留 A–Z 字母，去重后生效。</p>

          <h2>④ 词典</h2>
          <textarea
            className="text-input mono"
            rows={3}
            value={draft.dictText}
            onChange={(e) => patch({ dictText: e.target.value })}
            placeholder="以空格、逗号或换行分隔，例如 SOS MAYDAY"
            spellCheck={false}
          />
          {ignored.length > 0 && (
            <p className="hint warn">
              已忽略 {ignored.length} 个含字母表外字符的词条：{ignored.join('、')}
            </p>
          )}

          <div className="actions">
            <button className="primary" onClick={doSolve}>
              复原电文
            </button>
            {SAMPLES.map((s) => (
              <button key={s.id} className="ghost" title={s.description} onClick={() => setDraft(loadSample(s))}>
                {s.name}
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>复原结果</h2>
          <ResultPanel outcome={result.outcome} stale={stale} runs={result.runs} />
        </section>
      </main>
    </div>
  );
}
