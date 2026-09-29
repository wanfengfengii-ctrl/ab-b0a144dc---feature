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
   * 是否启用「回读一致性」：把整条纸带解释为以一个词间停顿分隔的
   * 两遍完全相同的电文。缺省视为 false（未启用时一切行为保持原样）。
   */
  readback?: boolean;
}

/** 回读分界词间停顿的位置信息。 */
export interface ReadbackBoundary {
  /** 分界词间停顿所在的游程下标（0 起始，必为空白游程）。 */
  gapRunIndex: number;
  /** 第一遍电文占用的游程下标区间 [0, gapRunIndex)；第二遍为 [gapRunIndex + 1, n)。 */
  firstRunCount: number;
  secondRunCount: number;
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
  /** 回读一致性启用且成立时，两遍电文完全相同；此处分界信息用于分栏展示。 */
  readbackBoundary?: ReadbackBoundary;
}

/** 无解：给出最早无法落入任何有效词典前缀的游程及原因。 */
export interface NoSolution {
  kind: 'no-solution';
  /** 0 起始的游程下标；处理到该段后不再有任何有效词典前缀可承接。 */
  failRunIndex: number;
  /** 人类可读的原因列表。 */
  reasons: string[];
}

/**
 * 回读不一致：启用「回读一致性」后，不存在任何分界词间停顿能让两遍电文
 * 在词、字母、摩尔斯码各层完全相同。给出最早不能配对的位置，绝不展示
 * 任一单边貌似成功的电文。
 */
export interface ReadbackMismatch {
  kind: 'readback-mismatch';
  /** 最早不能配对的位置；at 区分发生在字母配对还是分界选择阶段。 */
  at: 'letter' | 'boundary';
  /**
   * at === 'letter'：第一遍中最早无法与第二遍配对的字母序号（0 起始，
   * 按字母在整条电文中的顺序计）。
   */
  letterIndex?: number;
  /** at === 'letter' 时，该字母所在游程下标区间，便于编辑器高亮（第一遍 / 第二遍）。 */
  letterRunStart?: number;
  letterRunEnd?: number;
  letterRunStart2?: number;
  letterRunEnd2?: number;
  /** at === 'boundary'：参与尝试的候选分界词间停顿游程下标（升序）。 */
  candidateGapRunIndices?: number[];
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
  | NoSolution
  | ReadbackMismatch
  | InvalidInput;
