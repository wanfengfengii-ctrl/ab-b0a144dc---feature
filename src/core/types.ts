/** 游程类型：信号（明）或空白（暗）。 */
export type RunKind = 'signal' | 'gap';

/** 一段游程：纸带上连续的一段信号或空白。 */
export interface Run {
  kind: RunKind;
  /** 实测时长（任意正数，允许受潮噪声）。 */
  duration: number;
}

/** 游程解释类别。 */
export type InterpretationType = 'dot' | 'dash' | 'intra' | 'letter' | 'word';

/** 单个游程的解释结果。 */
export interface RunInterpretation {
  type: InterpretationType;
  /** 展示用中文标签。 */
  label: string;
  /** 目标单位倍数：点/符内=1，划/字母间隔=3，词间隔=7。 */
  targetUnits: number;
  /** 目标时长 = targetUnits * 单位时长。 */
  target: number;
  /** 绝对偏差 |实测时长 - 目标时长|。 */
  deviation: number;
}

/** 复原请求的完整输入。 */
export interface SolveInput {
  /** 明暗交替的游程序列，必须以信号开始并以信号结束。 */
  runs: Run[];
  /** 允许的整数单位时长下界（≥1）。 */
  unitMin: number;
  /** 允许的整数单位时长上界。 */
  unitMax: number;
  /** 受限字母表（大写 A-Z 去重）。 */
  alphabet: string[];
  /** 词典（大写单词）。 */
  dictionary: string[];
  /**
   * 启用「回读一致性」：把整条纸带解释为以正中一个词间停顿分隔的
   * 两遍完全相同电文。求解器在全序列共用一个整数单位与一套点划/停顿解释，
   * 两侧的词、字母与摩尔斯码逐个相同；一致性仅为可行性约束，不参与决胜。
   * 未启用（缺省 false）时一切按原规则进行。
   */
  readback?: boolean;
}

/** 复原成功。 */
export interface SolvedMessage {
  kind: 'solved';
  /** 共同选定的整数单位时长。 */
  unit: number;
  /** 总绝对时长偏差。 */
  totalDeviation: number;
  /** 单段最大偏差。 */
  maxDeviation: number;
  /** 每段游程的解释（与输入 runs 等长、同序）。 */
  interpretations: RunInterpretation[];
  /** 译出的单词序列（词界由此体现）。 */
  words: string[];
  /** 完整电文（单词以空格相连）。 */
  text: string;
  /** 摩尔斯序列展示：字母间空格、词间 " / "。 */
  morse: string;
  /** 稳定选择用的游程顺序解释编码。 */
  encoding: string;
}

/** 回读一致性成功：两遍电文逐词、逐字母、逐摩尔斯码完全相同。 */
export interface ReadbackSolved {
  kind: 'readback-solved';
  /** 共同选定的整数单位时长（全序列唯一）。 */
  unit: number;
  /** 整条纸带的总绝对时长偏差（两遍游程 + 分界停顿之和）。 */
  totalDeviation: number;
  /** 整条纸带的单段最大偏差。 */
  maxDeviation: number;
  /** 分界词间停顿的游程下标（0 起始，必为正中的空白游程）。 */
  dividerRunIndex: number;
  /** 分界词间停顿的解释。 */
  divider: RunInterpretation;
  /** 单遍电文的单词序列（两遍相同）。 */
  words: string[];
  /** 单遍完整电文（两遍相同）。 */
  text: string;
  /** 单遍摩尔斯序列（两遍相同）。 */
  morse: string;
  /** 全序列按游程顺序的解释编码（前半 + 词停顿 2 + 后半）。 */
  encoding: string;
  /** 第一遍：游程下标区间 [0, dividerRunIndex) 的解释。 */
  first: ReadbackHalf;
  /** 第二遍：游程下标区间 (dividerRunIndex, N) 的解释。 */
  second: ReadbackHalf;
}

/** 回读模式下的单遍电文：与对应游程区间等长、同序的解释。 */
export interface ReadbackHalf {
  interpretations: RunInterpretation[];
  /** 该遍游程在整条纸带中的起始下标。 */
  startIndex: number;
}

/**
 * 回读一致性失败：无法把纸带解释成由一个词间停顿分隔的两遍相同电文。
 * 定位到最早不能配对的位置——可以是某个空白游程（分界候选）或
 * 某一对本该相同的字母/游程；绝不输出任一单边貌似成功的电文。
 */
export interface ReadbackNoMatch {
  kind: 'readback-no-match';
  /** 最早不能配对的位置：分界停顿候选游程下标，或第一遍中失配游程的下标。 */
  failRunIndex: number;
  /** 失配发生在分界停顿还是两遍之间的逐段配对。 */
  failStage: 'divider' | 'pair';
  /** 人类可读的原因列表。 */
  reasons: string[];
}

/** 无解：给出最早无法落入任何有效词典前缀的游程及原因。 */
export interface NoSolution {
  kind: 'no-solution';
  /** 0 起始的游程下标；处理到该段后不再有任何有效词典前缀可承接。 */
  failRunIndex: number;
  /** 人类可读的原因列表。 */
  reasons: string[];
}

/** 输入不合法。 */
export interface InvalidInput {
  kind: 'invalid';
  errors: string[];
}

export type SolveOutcome =
  | SolvedMessage
  | ReadbackSolved
  | ReadbackNoMatch
  | NoSolution
  | InvalidInput;
