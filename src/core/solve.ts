import { MORSE_CODE, MORSE_TO_CHAR } from './morse';
import type {
  InterpretationType,
  Run,
  RunInterpretation,
  SolveInput,
  SolveOutcome,
} from './types';

/**
 * 复原核心：在整个游程序列上共同选择整数单位时长与各游程解释，
 * 使解释后的摩尔斯序列恰好译成受限字母表 + 词典中的词序列。
 *
 * 可行性只取决于“能否译码”（解释自由、偏差不设上限）；
 * 偏差仅用于在多个可行复原之间排序：
 *   1. 总绝对时长偏差最小；
 *   2. 单段最大偏差最小；
 *   3. 按游程顺序的解释编码字典序最小（稳定选择）；
 *   4. 若仍并列，取较小单位时长（确定性收口）。
 *
 * 无解时定位“最早无法落入任何有效词典前缀的游程”并给出原因，
 * 绝不输出貌似完整的电文。
 */

interface SignalOption {
  sym: '.' | '-';
  units: number;
  type: InterpretationType;
  label: string;
  enc: string;
}

const SIGNAL_OPTIONS: SignalOption[] = [
  { sym: '.', units: 1, type: 'dot', label: '点', enc: '0' },
  { sym: '-', units: 3, type: 'dash', label: '划', enc: '1' },
];

interface GapOption {
  units: number;
  type: InterpretationType;
  label: string;
  enc: string;
}

const GAP_OPTIONS: GapOption[] = [
  { units: 1, type: 'intra', label: '符内间隔', enc: '0' },
  { units: 3, type: 'letter', label: '字母间隔', enc: '1' },
  { units: 7, type: 'word', label: '词间隔', enc: '2' },
];

/** 单位时长搜索跨度的安全上限，防止误输入导致长时间计算。 */
const MAX_UNIT_SPAN = 5000;
/** 游程段数与词典规模的安全上限。 */
const MAX_RUNS = 400;
const MAX_WORDS = 500;
/** 展示原因的最大条数。 */
const MAX_REASONS = 5;

/**
 * 失败原因收集器：按解释力分桶——词典结构原因（无法落入前缀 / 未落在词界）
 * 最能说明“为什么拼不出呼号”，优先展示；字母表与长度原因次之。
 */
class ReasonBag {
  private structural = new Set<string>();
  private alphabet = new Set<string>();
  private length = new Set<string>();

  addStructural(text: string): void { this.structural.add(text); }
  addAlphabet(text: string): void { this.alphabet.add(text); }
  addLength(text: string): void { this.length.add(text); }

  list(): string[] {
    return [...this.structural, ...this.alphabet, ...this.length].slice(0, MAX_REASONS);
  }
}

/** 校验输入合法性，返回错误列表（空列表表示合法）。 */
export function validateInput(input: SolveInput): string[] {
  const errors: string[] = [];
  const { runs, unitMin, unitMax, alphabet, dictionary } = input;

  if (!Number.isInteger(unitMin) || !Number.isInteger(unitMax)) {
    errors.push('单位时长范围必须为整数');
  } else {
    if (unitMin < 1) errors.push('单位时长下限必须 ≥ 1');
    if (unitMin > unitMax) errors.push('单位时长下限不能大于上限');
    if (unitMax - unitMin > MAX_UNIT_SPAN) {
      errors.push(`单位时长范围跨度过大（> ${MAX_UNIT_SPAN}），请缩小范围`);
    }
  }

  if (runs.length === 0) errors.push('纸带为空：至少需要一段信号游程');
  if (runs.length > MAX_RUNS) errors.push(`游程段数过多（> ${MAX_RUNS}），请分段处理`);
  if (runs.length > 0 && runs.length % 2 === 0) {
    errors.push('纸带必须以信号游程开始并结束（游程总数应为奇数）');
  }
  runs.forEach((run, i) => {
    const expected: Run['kind'] = i % 2 === 0 ? 'signal' : 'gap';
    if (run.kind !== expected) {
      errors.push(`第 ${i + 1} 段应为${expected === 'signal' ? '信号' : '空白'}游程（明暗必须交替）`);
    }
    if (!Number.isFinite(run.duration) || run.duration <= 0) {
      errors.push(`第 ${i + 1} 段时长必须为正数`);
    }
  });

  if (alphabet.length === 0) errors.push('受限字母表为空');
  if (alphabet.some((c) => !/^[A-Z]$/.test(c))) errors.push('受限字母表只能包含 A-Z 字母');
  if (dictionary.length === 0) errors.push('词典为空');
  if (dictionary.length > MAX_WORDS) errors.push(`词典词条过多（> ${MAX_WORDS}）`);

  return errors;
}

/** 词典 trie：节点编号即前缀，便于在 DP 状态中引用。 */
interface Trie {
  children: Array<Map<string, number>>;
  terminal: boolean[];
  prefix: string[];
}

function buildTrie(words: string[]): Trie {
  const children: Array<Map<string, number>> = [new Map()];
  const terminal: boolean[] = [false];
  const prefix: string[] = [''];
  for (const word of words) {
    let node = 0;
    for (const ch of word) {
      let next = children[node].get(ch);
      if (next === undefined) {
        next = children.length;
        children.push(new Map());
        terminal.push(false);
        prefix.push(prefix[node] + ch);
        children[node].set(ch, next);
      }
      node = next;
    }
    terminal[node] = true;
  }
  return { children, terminal, prefix };
}

/** 保留完全由受限字母表组成的非空单词，去重。 */
export function usableWords(alphabet: string[], dictionary: string[]): string[] {
  const allowed = new Set(alphabet);
  const seen = new Set<string>();
  for (const raw of dictionary) {
    const w = raw.trim().toUpperCase();
    if (w.length > 0 && [...w].every((c) => allowed.has(c))) seen.add(w);
  }
  return [...seen];
}

/** 词典中被忽略的单词（含字母表外字符或为空）。 */
export function ignoredWords(alphabet: string[], dictionary: string[]): string[] {
  const allowed = new Set(alphabet);
  const seen = new Set<string>();
  const ignored: string[] = [];
  for (const raw of dictionary) {
    const w = raw.trim().toUpperCase();
    if (w.length === 0) continue;
    if (![...w].every((c) => allowed.has(c))) {
      if (!seen.has(w)) {
        seen.add(w);
        ignored.push(w);
      }
    }
  }
  return ignored;
}

// ---------------------------------------------------------------------------
// 无解定位：最早无法落入任何有效词典前缀的游程
// ---------------------------------------------------------------------------

interface ReachState {
  node: number;
  pending: string;
}

function reachKey(s: ReachState): string {
  return `${s.node}|${s.pending}`;
}

/**
 * 前向可达性分析（与单位时长无关：解释自由、偏差不设上限）。
 * 逐段处理游程，返回使可达状态集首次为空的游程下标及原因；
 * 若全程可达且结尾能落在词界上，返回 null。
 */
function findEarliestFailure(
  runs: Run[],
  trie: Trie,
  alphabetSet: ReadonlySet<string>,
  maxCodeLen: number,
): { failRunIndex: number; reasons: string[] } | null {
  let states = new Map<string, ReachState>([['0|', { node: 0, pending: '' }]]);

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const next = new Map<string, ReachState>();
    const reasons = new ReasonBag();

    for (const st of states.values()) {
      if (run.kind === 'signal') {
        for (const opt of SIGNAL_OPTIONS) {
          const pending = st.pending + opt.sym;
          if (pending.length > maxCodeLen) {
            reasons.addLength(
              `信号组合「${pending}」超出受限字母表的最长摩尔斯码（${maxCodeLen} 个符号），` +
                `且此前的空白游程无法把它切分成字母表内的字母`,
            );
            continue;
          }
          next.set(`${st.node}|${pending}`, { node: st.node, pending });
        }
      } else {
        // 符内间隔：延续当前字母（游程交替保证 pending 非空）。
        if (st.pending.length > 0) next.set(reachKey(st), st);
        // 字母间隔 / 词间隔：当前信号组合必须译成字母表内字母并落入词典前缀。
        const ch = MORSE_TO_CHAR[st.pending];
        if (!ch) {
          reasons.addAlphabet(`信号组合「${st.pending}」不是任何字母的摩尔斯码`);
        } else if (!alphabetSet.has(ch)) {
          reasons.addAlphabet(`信号组合「${st.pending}」译作「${ch}」，不在受限字母表中`);
        } else {
          const child = trie.children[st.node].get(ch);
          if (child === undefined) {
            reasons.addStructural(`词典中没有以「${trie.prefix[st.node]}${ch}」为前缀的单词`);
          } else {
            next.set(`${child}|`, { node: child, pending: '' });
            if (trie.terminal[child]) next.set('0|', { node: 0, pending: '' });
          }
        }
      }
    }

    if (next.size === 0) {
      return { failRunIndex: i, reasons: reasons.list() };
    }
    states = next;
  }

  // 结尾检查：纸带结束时必须恰好落在某个完整单词的词界上。
  const reasons = new ReasonBag();
  let ok = false;
  for (const st of states.values()) {
    const ch = MORSE_TO_CHAR[st.pending];
    if (!ch) {
      reasons.addAlphabet(`纸带末尾的信号组合「${st.pending}」不是任何字母的摩尔斯码`);
      continue;
    }
    if (!alphabetSet.has(ch)) {
      reasons.addAlphabet(`纸带末尾的信号组合「${st.pending}」译作「${ch}」，不在受限字母表中`);
      continue;
    }
    const child = trie.children[st.node].get(ch);
    if (child === undefined) {
      reasons.addStructural(`词典中没有以「${trie.prefix[st.node]}${ch}」为前缀的单词`);
      continue;
    }
    if (!trie.terminal[child]) {
      reasons.addStructural(`「${trie.prefix[st.node]}${ch}」不是词典中的完整单词（纸带结束必须落在词界）`);
      continue;
    }
    ok = true;
  }
  if (!ok) {
    return { failRunIndex: runs.length - 1, reasons: reasons.list() };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 动态规划：给定单位时长，求 (总偏差, 最大偏差, 编码) 最优的解释
// ---------------------------------------------------------------------------

interface Candidate {
  cost: number;
  max: number;
  code: string;
  interps: RunInterpretation[];
  words: string[];
  cur: string;
}

interface DpState {
  node: number;
  pending: string;
}

function dpKey(s: DpState): string {
  return `${s.node}|${s.pending}`;
}

/** 候选比较：总偏差 → 最大偏差 → 编码字典序。严格更优返回 true。 */
function better(a: Candidate, b: Candidate): boolean {
  if (a.cost !== b.cost) return a.cost < b.cost;
  if (a.max !== b.max) return a.max < b.max;
  return a.code < b.code;
}

function extend(c: Candidate, dev: number, enc: string, interp: RunInterpretation): Candidate {
  return {
    cost: c.cost + dev,
    max: Math.max(c.max, dev),
    code: c.code + enc,
    interps: [...c.interps, interp],
    words: c.words,
    cur: c.cur,
  };
}

function solveForUnit(
  runs: Run[],
  unit: number,
  trie: Trie,
  alphabetSet: ReadonlySet<string>,
  maxCodeLen: number,
): Candidate | null {
  const init: Candidate = { cost: 0, max: 0, code: '', interps: [], words: [], cur: '' };
  let states = new Map<string, { st: DpState; cand: Candidate }>([
    ['0|', { st: { node: 0, pending: '' }, cand: init }],
  ]);

  const offer = (
    next: Map<string, { st: DpState; cand: Candidate }>,
    st: DpState,
    cand: Candidate,
  ) => {
    const key = dpKey(st);
    const prev = next.get(key);
    if (!prev || better(cand, prev.cand)) next.set(key, { st, cand });
  };

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const next = new Map<string, { st: DpState; cand: Candidate }>();

    for (const { st, cand } of states.values()) {
      if (run.kind === 'signal') {
        for (const opt of SIGNAL_OPTIONS) {
          if (st.pending.length + 1 > maxCodeLen) continue;
          const target = opt.units * unit;
          const dev = Math.abs(run.duration - target);
          const interp: RunInterpretation = {
            type: opt.type, label: opt.label, targetUnits: opt.units, target, deviation: dev,
          };
          offer(
            next,
            { node: st.node, pending: st.pending + opt.sym },
            extend(cand, dev, opt.enc, interp),
          );
        }
      } else {
        for (const opt of GAP_OPTIONS) {
          const target = opt.units * unit;
          const dev = Math.abs(run.duration - target);
          const interp: RunInterpretation = {
            type: opt.type, label: opt.label, targetUnits: opt.units, target, deviation: dev,
          };
          if (opt.type === 'intra') {
            if (st.pending.length === 0) continue;
            offer(next, st, extend(cand, dev, opt.enc, interp));
          } else {
            const ch = MORSE_TO_CHAR[st.pending];
            if (!ch || !alphabetSet.has(ch)) continue;
            const child = trie.children[st.node].get(ch);
            if (child === undefined) continue;
            if (opt.type === 'word' && !trie.terminal[child]) continue;
            const c2 = extend(cand, dev, opt.enc, interp);
            c2.cur = cand.cur + ch;
            if (opt.type === 'word') {
              c2.words = [...cand.words, c2.cur];
              c2.cur = '';
              offer(next, { node: 0, pending: '' }, c2);
            } else {
              offer(next, { node: child, pending: '' }, c2);
            }
          }
        }
      }
    }

    states = next;
    if (states.size === 0) return null; // 可达性分析已保证不会发生
  }

  // 收尾：末尾信号组合必须译成字母并恰好完成一个词典单词。
  let best: Candidate | null = null;
  for (const { st, cand } of states.values()) {
    const ch = MORSE_TO_CHAR[st.pending];
    if (!ch || !alphabetSet.has(ch)) continue;
    const child = trie.children[st.node].get(ch);
    if (child === undefined || !trie.terminal[child]) continue;
    const final: Candidate = { ...cand, cur: cand.cur + ch, words: [...cand.words, cand.cur + ch] };
    if (!best || better(final, best)) best = final;
  }
  return best;
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export function solve(input: SolveInput): SolveOutcome {
  const errors = validateInput(input);
  if (errors.length > 0) return { kind: 'invalid', errors };

  const alphabetSet = new Set(input.alphabet);
  const words = usableWords(input.alphabet, input.dictionary);
  if (words.length === 0) {
    return {
      kind: 'no-solution',
      failRunIndex: 0,
      reasons: ['词典在受限字母表下没有可用单词，任何游程序列都无法落入有效词典前缀'],
    };
  }

  const trie = buildTrie(words);
  const maxCodeLen = Math.max(...input.alphabet.map((c) => MORSE_CODE[c]?.length ?? 0));

  const failure = findEarliestFailure(input.runs, trie, alphabetSet, maxCodeLen);
  if (failure) return { kind: 'no-solution', ...failure };

  let best: { unit: number; cand: Candidate } | null = null;
  for (let unit = input.unitMin; unit <= input.unitMax; unit++) {
    const cand = solveForUnit(input.runs, unit, trie, alphabetSet, maxCodeLen);
    if (!cand) continue;
    // 单位时长升序遍历，严格更优才替换：完全并列时稳定取较小单位。
    if (!best || better(cand, best.cand)) best = { unit, cand };
  }

  if (!best) {
    // 可达性分析已通过，理论上不可达；防御性返回。
    return {
      kind: 'no-solution',
      failRunIndex: input.runs.length - 1,
      reasons: ['纸带结尾无法译成词典中的完整单词'],
    };
  }

  const { unit, cand } = best;
  const morse = cand.words
    .map((w) => [...w].map((c) => MORSE_CODE[c]).join(' '))
    .join(' / ');
  return {
    kind: 'solved',
    unit,
    totalDeviation: cand.cost,
    maxDeviation: cand.max,
    interpretations: cand.interps,
    words: cand.words,
    text: cand.words.join(' '),
    morse,
    encoding: cand.code,
  };
}
