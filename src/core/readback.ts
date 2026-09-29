import { MORSE_CODE, MORSE_TO_CHAR } from './morse';
import { GAP_OPTIONS, SIGNAL_OPTIONS, type Trie } from './primitives';
import type {
  ReadbackMismatch,
  Run,
  RunInterpretation,
  SolvedMessage,
} from './types';

/**
 * 回读一致性求解（联合求解，绝不先按单遍规则求解再事后筛选）。
 *
 * 整条纸带必须解释为「电文 ＋ 一个词间停顿 ＋ 同一电文」。求解器在全序列上
 * 共同选择：
 *   - 一个全局唯一的整数单位时长；
 *   - 每一段游程的点 / 划 / 停顿解释（含作为分界的那一个词间停顿）；
 *   - 分界词间停顿落在哪一段空白游程上；
 * 并在同一次动态规划中逐事件配对两侧：同一个局部信号位置必须给出同一个点 / 划
 * 符号、同一个空白位置必须给出同类别停顿；每次闭合字母时两侧字母必须相同、词序
 * 一致——由此保证摩尔斯码、字母、词三层逐一相等。两侧因而折叠为同一条抽象解释
 * 路径，路径上每段的偏差按两侧各自的实测时长分别计算后合并。
 *
 * 决胜口径与单遍完全一致：总绝对偏差 → 单段最大偏差 → 游程顺序解释编码
 * 字典序（第一遍编码 + 分界词间隔编码 2 + 第二遍编码）→ 较小单位时长；
 * 一致性只是可行性约束。
 */

/**
 * 配对 DP：分界两侧游程段等长、相位一致，而可行回读又要求同位置停顿同类别、
 * 字母相同（摩尔斯符号因此也相同），所以两侧可折叠为**同一条抽象解释路径**：
 * 每个位置共同选一个解释，费用累加该解释在两侧实测时长上的偏差。
 */
interface PairCandidate {
  /** 两侧偏差之和（分界词间停顿不计入此处）。 */
  cost: number;
  /** 两侧各段偏差的最大值。 */
  max: number;
  /** 单侧解释编码（两侧完全一致）。 */
  code: string;
  interps1: RunInterpretation[];
  interps2: RunInterpretation[];
  words: string[];
  cur: string;
}

interface PairState {
  node: number;
  pending: string;
}

function pairKey(s: PairState): string {
  return `${s.node}|${s.pending}`;
}

function makeInterp(
  opt: { units: number; type: RunInterpretation['type']; label: string },
  duration: number,
  unit: number,
): RunInterpretation {
  const target = opt.units * unit;
  return {
    type: opt.type,
    label: opt.label,
    targetUnits: opt.units,
    target,
    deviation: Math.abs(duration - target),
  };
}

/** 候选比较：总偏差 → 最大偏差 → 编码字典序。严格更优返回 true。 */
function pairBetter(
  a: { cost: number; max: number; code: string },
  b: { cost: number; max: number; code: string },
): boolean {
  if (a.cost !== b.cost) return a.cost < b.cost;
  if (a.max !== b.max) return a.max < b.max;
  return a.code < b.code;
}

/**
 * 对给定分界 b（空白游程下标）与单位时长做联合配对 DP。
 * 抽象路径上的每一步同时作用于第一遍游程 [0,b) 与第二遍游程 [b+1,n)。
 */
function pairedDecode(
  runs: Run[],
  b: number,
  unit: number,
  trie: Trie,
  alphabetSet: ReadonlySet<string>,
  maxCodeLen: number,
): PairCandidate | null {
  const init: PairCandidate = {
    cost: 0, max: 0, code: '', interps1: [], interps2: [], words: [], cur: '',
  };
  let states = new Map<string, { st: PairState; cand: PairCandidate }>();
  states.set('0|', { st: { node: 0, pending: '' }, cand: init });

  const offer = (
    next: Map<string, { st: PairState; cand: PairCandidate }>,
    st: PairState,
    cand: PairCandidate,
  ) => {
    const key = pairKey(st);
    const prev = next.get(key);
    if (!prev || pairBetter(cand, prev.cand)) next.set(key, { st, cand });
  };

  const halfLen = b; // [0,b) 长度 = b；右侧 [b+1,n) 长度 = n-1-b，调用方保证二者相等

  for (let local = 0; local < halfLen; local++) {
    const i1 = local;
    const i2 = b + 1 + local;
    const run1 = runs[i1];
    const run2 = runs[i2];
    const next = new Map<string, { st: PairState; cand: PairCandidate }>();

    for (const { st, cand } of states.values()) {
      if (run1.kind === 'signal') {
        // 点 / 划共同二选一：两侧摩尔斯符号必须相同。
        for (const opt of SIGNAL_OPTIONS) {
          if (st.pending.length + 1 > maxCodeLen) continue;
          const interp1 = makeInterp(opt, run1.duration, unit);
          const interp2 = makeInterp(opt, run2.duration, unit);
          offer(next, { node: st.node, pending: st.pending + opt.sym }, {
            cost: cand.cost + interp1.deviation + interp2.deviation,
            max: Math.max(cand.max, interp1.deviation, interp2.deviation),
            code: cand.code + opt.enc,
            interps1: [...cand.interps1, interp1],
            interps2: [...cand.interps2, interp2],
            words: cand.words,
            cur: cand.cur,
          });
        }
      } else {
        for (const opt of GAP_OPTIONS) {
          const interp1 = makeInterp(opt, run1.duration, unit);
          const interp2 = makeInterp(opt, run2.duration, unit);
          const dev = interp1.deviation + interp2.deviation;
          const stepMax = Math.max(interp1.deviation, interp2.deviation);

          if (opt.type === 'intra') {
            if (st.pending.length === 0) continue;
            offer(next, st, {
              ...cand,
              cost: cand.cost + dev,
              max: Math.max(cand.max, stepMax),
              code: cand.code + opt.enc,
              interps1: [...cand.interps1, interp1],
              interps2: [...cand.interps2, interp2],
            });
            continue;
          }

          // 字母 / 词间隔：当前信号组合必须译成字母表内字母并落入词典前缀。
          const ch = MORSE_TO_CHAR[st.pending];
          if (!ch || !alphabetSet.has(ch)) continue;
          const child = trie.children[st.node].get(ch);
          if (child === undefined) continue;
          if (opt.type === 'word' && !trie.terminal[child]) continue;

          const base: PairCandidate = {
            cost: cand.cost + dev,
            max: Math.max(cand.max, stepMax),
            code: cand.code + opt.enc,
            interps1: [...cand.interps1, interp1],
            interps2: [...cand.interps2, interp2],
            words: cand.words,
            cur: cand.cur + ch,
          };
          if (opt.type === 'word') {
            offer(next, { node: 0, pending: '' }, {
              ...base,
              words: [...cand.words, base.cur],
              cur: '',
            });
          } else {
            offer(next, { node: child, pending: '' }, base);
          }
        }
      }
    }

    states = next;
    if (states.size === 0) return null;
  }

  // 收尾：末尾信号组合必须译成字母并恰好完成一个词典单词。
  let best: PairCandidate | null = null;
  for (const { st, cand } of states.values()) {
    const ch = MORSE_TO_CHAR[st.pending];
    if (!ch || !alphabetSet.has(ch)) continue;
    const child = trie.children[st.node].get(ch);
    if (child === undefined || !trie.terminal[child]) continue;
    const finalCand: PairCandidate = {
      ...cand,
      words: [...cand.words, cand.cur + ch],
      cur: '',
    };
    if (!best || pairBetter(finalCand, best)) best = finalCand;
  }
  return best;
}

// ---------------------------------------------------------------------------
// 无解定位：在候选分界下让两侧各自译码，逐个字母配对找出最早失配位置
// ---------------------------------------------------------------------------

interface DecodeResult {
  words: string[];
  letterCh: string[];
  letterWord: number[];
  letterMorse: string[];
  letterStarts: number[];
  letterEnds: number[];
  /** 是否恰好以完整词典单词收尾（false 表示该半段中途或末尾无法继续译码）。 */
  full: boolean;
  /** 未闭合字母首个信号游程下标（无则 -1）。 */
  openStart: number;
  /** 可达状态终止的游程下标（状态集变空处，或半段末段）。 */
  failRunIndex: number;
  /** 半段结束时最优可达状态的未闭合信号组合（为空串表示无未闭合字母）。 */
  endPending: string;
  /** endPending 对应的 trie 前缀节点（0 表示词界起点）。 */
  endNode: number;
}

interface DecState {
  node: number;
  pending: string;
  words: string[];
  cur: string;
  letterCh: string[];
  letterWord: number[];
  letterMorse: string[];
  letterStarts: number[];
  letterEnds: number[];
  openStart: number;
}

/**
 * 单侧可达译码（与单位时长无关：解释自由、偏差不设上限）。
 * 能恰好落在词界时返回完整译码；否则返回「尽可能长」的部分译码
 * （闭合字母最多的可达状态）及终止游程，供回读失配定位使用。
 */
function decodeHalf(
  runs: Run[],
  from: number,
  to: number,
  trie: Trie,
  alphabetSet: ReadonlySet<string>,
  maxCodeLen: number,
): DecodeResult {
  let states = new Map<string, DecState>();
  states.set('0|', {
    node: 0, pending: '', words: [], cur: '',
    letterCh: [], letterWord: [], letterMorse: [], letterStarts: [], letterEnds: [], openStart: -1,
  });

  const rank = (s: DecState): number => s.letterCh.length * 100 + s.pending.length;
  let best: DecState = states.get('0|')!;
  let diedAt = to - 1;

  for (let i = from; i < to; i++) {
    const run = runs[i];
    const nxt = new Map<string, DecState>();
    const put = (s: DecState) => {
      const key = `${s.node}|${s.pending}`;
      const prev = nxt.get(key);
      if (!prev || rank(s) > rank(prev)) nxt.set(key, s);
      if (rank(s) > rank(best)) best = s;
    };

    for (const st of states.values()) {
      if (run.kind === 'signal') {
        for (const opt of SIGNAL_OPTIONS) {
          if (st.pending.length + 1 > maxCodeLen) continue;
          put({
            ...st,
            pending: st.pending + opt.sym,
            openStart: st.openStart === -1 ? i : st.openStart,
          });
        }
      } else {
        if (st.pending.length > 0) put(st); // 符内间隔
        const ch = MORSE_TO_CHAR[st.pending];
        if (ch && alphabetSet.has(ch)) {
          const child = trie.children[st.node].get(ch);
          if (child !== undefined) {
            // m 个符号的字母占 2m-1 段；闭合空白位于 i，首信号下标 = i-(2m-1)。
            const start = st.openStart === -1 ? i - st.pending.length * 2 + 1 : st.openStart;
            const base: DecState = {
              ...st,
              pending: '',
              cur: st.cur + ch,
              openStart: -1,
              letterCh: [...st.letterCh, ch],
              letterWord: [...st.letterWord, st.words.length],
              letterMorse: [...st.letterMorse, st.pending],
              letterStarts: [...st.letterStarts, start],
              letterEnds: [...st.letterEnds, i - 1],
            };
            put({ ...base, node: child }); // 字母间隔
            if (trie.terminal[child]) {
              put({ ...base, node: 0, words: [...st.words, st.cur + ch], cur: '' }); // 词间隔
            }
          }
        }
      }
    }
    states = nxt;
    if (states.size === 0) {
      diedAt = i;
      break;
    }
  }

  let terminal: DecState | null = null;
  for (const st of states.values()) {
    if (rank(st) > rank(best)) best = st;
    const ch = MORSE_TO_CHAR[st.pending];
    if (!ch || !alphabetSet.has(ch)) continue;
    const child = trie.children[st.node].get(ch);
    if (child === undefined || !trie.terminal[child]) continue;
    if (!terminal || rank(st) > rank(terminal)) terminal = st;
  }

  if (terminal) {
    const st = terminal;
    const start = st.openStart === -1 ? to - st.pending.length * 2 + 1 : st.openStart;
    return {
      words: [...st.words, st.cur + chOf(st)],
      letterCh: [...st.letterCh, chOf(st)],
      letterWord: [...st.letterWord, st.words.length],
      letterMorse: [...st.letterMorse, st.pending],
      letterStarts: [...st.letterStarts, start],
      letterEnds: [...st.letterEnds, to - 1],
      full: true,
      openStart: -1,
      failRunIndex: to - 1,
      endPending: '',
      endNode: 0,
    };
  }
  return {
    words: best.words,
    letterCh: best.letterCh,
    letterWord: best.letterWord,
    letterMorse: best.letterMorse,
    letterStarts: best.letterStarts,
    letterEnds: best.letterEnds,
    full: false,
    openStart: best.openStart,
    failRunIndex: diedAt,
    endPending: best.pending,
    endNode: best.node,
  };
}

function chOf(st: DecState): string {
  return MORSE_TO_CHAR[st.pending];
}

interface FailurePick {
  /** 最早不能配对的字母序号（0 起始，按字母在整条电文中的顺序）。 */
  li: number;
  b: number;
  d1: DecodeResult;
  d2: DecodeResult;
  /** 该序号在两侧的实际游程跨度；缺字母 / 无法译码一侧给出其终止游程区间（可能为 null）。 */
  span1: [number, number] | null;
  span2: [number, number] | null;
}

/**
 * 失配定位：分界在结构上只能是正中央的空白游程，因此让两侧各自做
 * （可达性意义下的）单侧译码，逐个比较词序、字母与摩尔斯码，找出最早
 * 不能配对的字母；任一侧中途无法译码时以其终止游程标出。
 * 中央不是空白游程时直接给分界级结论。
 */
function findReadbackFailure(
  runs: Run[],
  trie: Trie,
  alphabetSet: ReadonlySet<string>,
  maxCodeLen: number,
):
  | { at: 'letter'; pick: FailurePick }
  | { at: 'boundary'; reason: 'center-signal' | 'no-gap' } {
  const n = runs.length;
  const center = (n - 1) / 2;
  if (!Number.isInteger(center) || runs[center].kind !== 'gap') {
    return {
      at: 'boundary',
      reason: Number.isInteger(center) && runs[center]?.kind === 'signal' ? 'center-signal' : 'no-gap',
    };
  }

  const b = center;
  const d1 = decodeHalf(runs, 0, b, trie, alphabetSet, maxCodeLen);
  const d2 = decodeHalf(runs, b + 1, n, trie, alphabetSet, maxCodeLen);

  let li = -1;
  const common = Math.min(d1.letterCh.length, d2.letterCh.length);
  for (let k = 0; k < common; k++) {
    if (
      d1.letterCh[k] !== d2.letterCh[k] ||
      d1.letterWord[k] !== d2.letterWord[k] ||
      d1.letterMorse[k] !== d2.letterMorse[k]
    ) {
      li = k;
      break;
    }
  }
  if (li === -1 && d1.letterCh.length === d2.letterCh.length && d1.full && d2.full) {
    // 理论不可达：两侧完整且相同意味着配对 DP 必有解。防御性归为分界失败。
    return { at: 'boundary', reason: 'center-signal' };
  }
  if (li === -1) li = common; // 公共前缀一致，第 common 个字母起无法配对

  let span1: [number, number] | null = null;
  let span2: [number, number] | null = null;
  if (li < d1.letterCh.length) {
    span1 = [d1.letterStarts[li], d1.letterEnds[li]];
  } else if (d1.openStart >= 0) {
    span1 = [d1.openStart, d1.failRunIndex];
  } else if (!d1.full) {
    span1 = [d1.failRunIndex, d1.failRunIndex];
  }
  if (li < d2.letterCh.length) {
    span2 = [d2.letterStarts[li], d2.letterEnds[li]];
  } else if (d2.openStart >= 0) {
    span2 = [d2.openStart, d2.failRunIndex];
  } else if (!d2.full) {
    span2 = [d2.failRunIndex, d2.failRunIndex];
  }

  return { at: 'letter', pick: { li, b, d1, d2, span1, span2 } };
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export function solveReadback(
  runs: Run[],
  trie: Trie,
  alphabetSet: ReadonlySet<string>,
  maxCodeLen: number,
  unitMin: number,
  unitMax: number,
): SolvedMessage | ReadbackMismatch {
  const n = runs.length;
  const center = (n - 1) / 2;

  // 两侧游程数必须相等才能逐事件配对 → 分界只可能落在正中央，且该处必须是空白游程。
  let best: { unit: number; cand: PairCandidate; b: number; boundaryDev: number } | null = null;

  if (Number.isInteger(center) && runs[center].kind === 'gap') {
    const b = center;
    for (let unit = unitMin; unit <= unitMax; unit++) {
      const cand = pairedDecode(runs, b, unit, trie, alphabetSet, maxCodeLen);
      if (!cand) continue;
      const boundaryDev = Math.abs(runs[b].duration - 7 * unit);
      const score = {
        cost: cand.cost + boundaryDev,
        max: Math.max(cand.max, boundaryDev),
        code: cand.code + '2' + cand.code,
      };
      // 单位时长升序遍历，严格更优才替换：完全并列时稳定取较小单位。
      const betterThanBest = !best || (() => {
        const prev = best as { cand: PairCandidate; boundaryDev: number };
        const pscore = {
          cost: prev.cand.cost + prev.boundaryDev,
          max: Math.max(prev.cand.max, prev.boundaryDev),
          code: prev.cand.code + '2' + prev.cand.code,
        };
        if (score.cost !== pscore.cost) return score.cost < pscore.cost;
        if (score.max !== pscore.max) return score.max < pscore.max;
        return score.code < pscore.code;
      })();
      if (betterThanBest) best = { unit, cand, b, boundaryDev };
    }
  }

  if (best) {
    const { unit, cand, b, boundaryDev } = best;
    const words = cand.words;
    const boundaryInterp: RunInterpretation = makeInterp(GAP_OPTIONS[2], runs[b].duration, unit);
    const interpretations: RunInterpretation[] = [
      ...cand.interps1,
      boundaryInterp,
      ...cand.interps2,
    ];
    const morse = words
      .map((w) => [...w].map((c) => MORSE_CODE[c]).join(' '))
      .join(' / ');
    return {
      kind: 'solved',
      unit,
      totalDeviation: cand.cost + boundaryDev,
      maxDeviation: Math.max(cand.max, boundaryDev),
      interpretations,
      words,
      text: words.join(' '),
      morse,
      encoding: cand.code + '2' + cand.code,
      readbackBoundary: {
        gapRunIndex: b,
        firstRunCount: b,
        secondRunCount: n - 1 - b,
      },
    };
  }

  // 不可行：定位最早不能配对的字母；中央结构上不能成为分界时给分界级结论。
  const failure = findReadbackFailure(runs, trie, alphabetSet, maxCodeLen);
  if (failure.at === 'letter') {
    const { pick } = failure;
    const k = pick.li;
    const in1 = k < pick.d1.letterCh.length;
    const in2 = k < pick.d2.letterCh.length;
    const ch1 = in1 ? pick.d1.letterCh[k] : null;
    const ch2 = in2 ? pick.d2.letterCh[k] : null;
    const reasons: string[] = [];
    if (ch1 && ch2) {
      const w1 = pick.d1.words[pick.d1.letterWord[k]] ?? '';
      const w2 = pick.d2.words[pick.d2.letterWord[k]] ?? '';
      reasons.push(
        `第 ${k + 1} 个字母不能配对：第一遍为「${ch1}」（摩尔斯 ${pick.d1.letterMorse[k]}，词「${w1}」），` +
          `第二遍为「${ch2}」（摩尔斯 ${pick.d2.letterMorse[k]}，词「${w2}」）`,
      );
    } else {
      const side = (d: DecodeResult): string => {
        if (d.endPending) {
          const ch = MORSE_TO_CHAR[d.endPending];
          if (ch && alphabetSet.has(ch)) {
            const child = trie.children[d.endNode].get(ch);
            if (child !== undefined && !trie.terminal[child]) {
              return `末尾信号组合「${d.endPending}」译作「${ch}」，使该遍停在不完整单词「${trie.prefix[child]}」（半段结束未落在词界）`;
            }
            if (child === undefined) {
              return `末尾信号组合「${d.endPending}」译作「${ch}」，但词典中没有以「${trie.prefix[d.endNode]}${ch}」为前缀的单词`;
            }
          } else if (ch) {
            return `在第 ${d.failRunIndex + 1} 段游程处留下信号组合「${d.endPending}」（译作「${ch}」，不在受限字母表中）`;
          }
          return `在第 ${d.failRunIndex + 1} 段游程处留下不是任何字母的未闭合信号组合「${d.endPending}」`;
        }
        if (!d.full) {
          return `停在不完整单词前缀「${trie.prefix[d.endNode]}」，半段结束时未落在词界`;
        }
        return '已经结束';
      };
      reasons.push(
        `第 ${k + 1} 个字母不能配对：第一遍${side(pick.d1)}，第二遍${side(pick.d2)}` +
          `（此前 ${k} 个字母两侧一致）`,
      );
    }
    reasons.push(`以结构上唯一可能的第 ${pick.b + 1} 段（纸带正中央）空白游程作为词间停顿进行配对`);
    return {
      kind: 'readback-mismatch',
      at: 'letter',
      letterIndex: k,
      letterRunStart: pick.span1 ? pick.span1[0] : undefined,
      letterRunEnd: pick.span1 ? pick.span1[1] : undefined,
      letterRunStart2: pick.span2 ? pick.span2[0] : undefined,
      letterRunEnd2: pick.span2 ? pick.span2[1] : undefined,
      reasons,
    };
  }

  const reasons: string[] = [];
  if (!Number.isInteger(center)) {
    reasons.push(
      `纸带共 ${n} 段：两遍电文游程数必须相等，需要一个居中的词间停顿，` +
        `但偶数游程总数无法分成两个等长半段（分界两侧游程数不等）`,
    );
  } else if (failure.reason === 'center-signal') {
    reasons.push(
      `纸带正中央第 ${center + 1} 段是信号游程，不能充当分界词间停顿；` +
        `两遍等长要求分界只能落在该位置`,
    );
  } else {
    reasons.push('纸带不存在可充当分界的居中空白游程，无法形成「电文 ＋ 词间停顿 ＋ 同一电文」');
  }
  return {
    kind: 'readback-mismatch',
    at: 'boundary',
    candidateGapRunIndices: Number.isInteger(center) ? [center] : [],
    reasons,
  };
}
