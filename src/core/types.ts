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

export type SolveOutcome = SolvedMessage | NoSolution | InvalidInput;
