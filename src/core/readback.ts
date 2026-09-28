import { MORSE_CODE, MORSE_TO_CHAR } from './morse';
import {
  GAP_OPTIONS,
  SIGNAL_OPTIONS,
  buildTrie,
  findEarliestFailure,
  usableWords,
} from './solve';
import type {
  ReadbackNoMatch,
  ReadbackSolved,
  Run,
  RunInterpretation,
  SolveInput,
} from './types';

/**
 * 回读一致性复原：把整条纸带解释为「电文 M —— 词间停顿 —— 同一个 M」。
 *
 * 纸带以信号开始、以信号结束，两遍电文等长且各以信号起止，故：
 *   游程总数 N = 2k + 1，其中 k 为单遍游程数（奇数），即 N ≡ 3 (mod 4)，
 *   分界词间停顿恒为正中的空白游程 runs[k]。
 *
 * 求解器在全序列共同选择一个整数单位时长与一套点划/停顿解释：
 * 单遍的每个解释位置同时作用于两遍中互为镜像的两段游程，偏差为两段之和，
 * 两侧译出的词、字母、摩尔斯码因此必然逐个相同——不是先按原规则求单遍最优
 * 再事后筛选。决胜口径与普通复原完全一致（总偏差 → 单段最大偏差 →
 * 解释编码字典序 → 较小单位时长），一致性只作为可行性约束。
 */

interface RbCandidate {
  /** 两遍镜像游程的偏差之和（不含分界停顿）。 */
  cost: number;
  max: number;
  /** 单遍各位置的解释编码（全序列编码为 code + '2' + code）。 */
  code: string;
  words: string[];
  cur: string;
}

interface RbState {
  node: number;
  pending: string;
}

function rbKey(s: RbState): string {
  return `${s.node}|${s.pending}`;
}

/** 候选比较：总偏差 → 最大偏差 → 编码字典序。严格更优返回 true。 */
function rbBetter(a: RbCandidate, b: RbCandidate): boolean {
  if (a.cost !== b.cost) return a.cost < b.cost;
  if (a.max !== b.max) return a.max < b.max;
  return a.code < b.code;
}

type RbOption = (typeof SIGNAL_OPTIONS)[number] | (typeof GAP_OPTIONS)[number];

function makeInterpretation(opt: RbOption, run: Run, unit: number): RunInterpretation {
  const target = opt.units * unit;
  return {
    type: opt.type,
    label: opt.label,
    targetUnits: opt.units,
    target,
    deviation: Math.abs(run.duration - target),
  };
}

/**
 * 给定单位时长：单遍的每个解释位置同时施加在两遍镜像游程上做联合动态规划。
 * cost/max 已含分界词停顿的偏差（单位固定时分界目标恒为 7*unit）。
 */
function solveReadbackForUnit(
  runs: Run[],
  k: number,
  unit: number,
  dividerDev: number,
  trie: ReturnType<typeof buildTrie>,
  alphabetSet: ReadonlySet<string>,
  maxCodeLen: number,
): RbCandidate | null {
  const N = runs.length;
  const init: RbCandidate = { cost: dividerDev, max: dividerDev, code: '', words: [], cur: '' };
  let states = new Map<string, { st: RbState; cand: RbCandidate }>([
    ['0|', { st: { node: 0, pending: '' }, cand: init }],
  ]);

  const offer = (
    next: Map<string, { st: RbState; cand: RbCandidate }>,
    st: RbState,
    cand: RbCandidate,
  ) => {
    const key = rbKey(st);
    const prev = next.get(key);
    if (!prev || rbBetter(cand, prev.cand)) next.set(key, { st, cand });
  };

  // 单遍第 j 段对应第一遍 runs[j] 与第二遍 runs[N-1-j]（二者明暗种类相同）。
  for (let j = 0; j < k; j++) {
    const left = runs[j];
    const right = runs[N - 1 - j];
    const next = new Map<string, { st: RbState; cand: RbCandidate }>();

    for (const { st, cand } of states.values()) {
      if (left.kind === 'signal') {
        for (const opt of SIGNAL_OPTIONS) {
          if (st.pending.length + 1 > maxCodeLen) continue;
          const devL = Math.abs(left.duration - opt.units * unit);
          const devR = Math.abs(right.duration - opt.units * unit);
          offer(
            next,
            { node: st.node, pending: st.pending + (opt.type === 'dot' ? '.' : '-') },
            {
              cost: cand.cost + devL + devR,
              max: Math.max(cand.max, devL, devR),
              code: cand.code + opt.enc,
              words: cand.words,
              cur: cand.cur,
            },
          );
        }
      } else {
        for (const opt of GAP_OPTIONS) {
          const devL = Math.abs(left.duration - opt.units * unit);
          const devR = Math.abs(right.duration - opt.units * unit);
          const base: RbCandidate = {
            cost: cand.cost + devL + devR,
            max: Math.max(cand.max, devL, devR),
            code: cand.code + opt.enc,
            words: cand.words,
            cur: cand.cur,
          };
          if (opt.type === 'intra') {
            if (st.pending.length === 0) continue;
            offer(next, st, base);
            continue;
          }
          const ch = MORSE_TO_CHAR[st.pending];
          if (!ch || !alphabetSet.has(ch)) continue;
          const child = trie.children[st.node].get(ch);
          if (child === undefined) continue;
          if (opt.type === 'word' && !trie.terminal[child]) continue;
          base.cur = cand.cur + ch;
          if (opt.type === 'word') {
            base.words = [...cand.words, base.cur];
            base.cur = '';
            offer(next, { node: 0, pending: '' }, base);
          } else {
            offer(next, { node: child, pending: '' }, base);
          }
        }
      }
    }

    states = next;
    if (states.size === 0) return null; // 可达性分析已保证不会发生
  }

  // 收尾：末尾信号组合必须译成字母并恰好完成一个词典单词（两遍同时完成）。
  let best: RbCandidate | null = null;
  for (const { st, cand } of states.values()) {
    const ch = MORSE_TO_CHAR[st.pending];
    if (!ch || !alphabetSet.has(ch)) continue;
    const child = trie.children[st.node].get(ch);
    if (child === undefined || !trie.terminal[child]) continue;
    const final: RbCandidate = { ...cand, cur: cand.cur + ch, words: [...cand.words, cand.cur + ch] };
    if (!best || rbBetter(final, best)) best = final;
  }
  return best;
}

/** 回读一致性求解入口（假定输入已通过 validateInput）。 */
export function solveReadback(input: SolveInput): ReadbackSolved | ReadbackNoMatch {
  const { runs, unitMin, unitMax } = input;
  const N = runs.length;
  const center = (N - 1) / 2;

  // 等长两遍 + 单个分界词间停顿 ⇒ N = 2k+1 且 k 为奇数 ⇔ N ≡ 3 (mod 4)。
  if (N % 4 !== 3) {
    return {
      kind: 'readback-no-match',
      failStage: 'divider',
      failRunIndex: center,
      reasons: [
        `纸带共 ${N} 段：两段各以信号起止的等长电文，只能由正中第 ${center + 1} 段空白词间停顿` +
          `分隔，合法回读纸带的游程总数必须为 4m+3；当前正中第 ${center + 1} 段是信号游程，` +
          `不可能承担分界词间停顿——最早不能配对的就是这条分界`,
      ],
    };
  }

  const k = (N - 1) / 2; // 单遍游程数（奇数），runs[k] 必为空白
  const alphabetSet = new Set(input.alphabet);
  const words = usableWords(input.alphabet, input.dictionary);
  if (words.length === 0) {
    return {
      kind: 'readback-no-match',
      failStage: 'pair',
      failRunIndex: 0,
      reasons: ['词典在受限字母表下没有可用单词，两遍电文都无法落入有效词典前缀'],
    };
  }
  const trie = buildTrie(words);
  const maxCodeLen = Math.max(...input.alphabet.map((c) => MORSE_CODE[c]?.length ?? 0));

  // 可达性与单位时长无关（解释自由、偏差不设上限）。单遍每个解释位置同时
  // 作用于明暗种类相同的两段镜像游程，故只要共享解释能把第一遍译到词界，
  // 第二遍必译出逐字母相同的同一电文。在第一遍游程上做前向可达性分析，
  // 失败点即两遍最早不能配对的位置。
  const failure = findEarliestFailure(runs.slice(0, k), trie, alphabetSet, maxCodeLen);
  if (failure) {
    const j = failure.failRunIndex;
    return {
      kind: 'readback-no-match',
      failStage: 'pair',
      failRunIndex: j,
      reasons: [
        `两遍在第 ${j + 1} 个回读位置之前尚可逐段同构配对（第一遍第 ${j + 1} 段 ↔ 第二遍第` +
          `${N - j} 段共用同一解释），但推进到该位置后，两侧无法再保持相同的有效词典前缀——` +
          `词、字母与摩尔斯码必须逐个相同并在词界闭合`,
        ...failure.reasons,
      ],
    };
  }

  let best: { unit: number; cand: RbCandidate } | null = null;
  for (let unit = unitMin; unit <= unitMax; unit++) {
    const dividerDev = Math.abs(runs[k].duration - 7 * unit);
    const cand = solveReadbackForUnit(
      runs, k, unit, dividerDev, trie, alphabetSet, maxCodeLen,
    );
    if (!cand) continue;
    // 单位时长升序遍历，严格更优才替换：完全并列时稳定取较小单位。
    if (!best || rbBetter(cand, best.cand)) best = { unit, cand };
  }

  if (!best) {
    return {
      kind: 'readback-no-match',
      failStage: 'pair',
      failRunIndex: k - 1,
      reasons: ['分界停顿两侧无法在共同整数单位时长下形成两遍相同电文'],
    };
  }

  const { unit, cand } = best;

  // 由稳定编码重建全序列解释：第一遍 + 分界词停顿 + 第二遍（同一套解释）。
  const firstInterps: RunInterpretation[] = [];
  for (let j = 0; j < k; j++) {
    firstInterps.push(makeInterpretation(pickOption(runs[j], cand.code[j]), runs[j], unit));
  }
  const divider = makeInterpretation(GAP_OPTIONS[2], runs[k], unit);
  const secondInterps: RunInterpretation[] = [];
  for (let t = k + 1; t < N; t++) {
    const j = t - (k + 1);
    secondInterps.push(makeInterpretation(pickOption(runs[t], cand.code[j]), runs[t], unit));
  }

  const morse = cand.words
    .map((w) => [...w].map((c) => MORSE_CODE[c]).join(' '))
    .join(' / ');

  return {
    kind: 'readback-solved',
    unit,
    totalDeviation: cand.cost,
    maxDeviation: cand.max,
    dividerRunIndex: k,
    divider,
    words: cand.words,
    text: cand.words.join(' '),
    morse,
    encoding: cand.code + '2' + cand.code,
    first: { interpretations: firstInterps, startIndex: 0 },
    second: { interpretations: secondInterps, startIndex: k + 1 },
  };
}

function pickOption(run: Run, enc: string): RbOption {
  if (run.kind === 'signal') {
    return enc === '0' ? SIGNAL_OPTIONS[0] : SIGNAL_OPTIONS[1];
  }
  return GAP_OPTIONS[Number(enc)];
}
