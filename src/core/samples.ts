import type { Run, SolveInput } from './types';

/** 按时长序列构造游程：自动明暗交替，以信号开始。 */
export function runsFromDurations(durations: number[]): Run[] {
  return durations.map((d, i) => ({
    kind: i % 2 === 0 ? 'signal' : 'gap',
    duration: d,
  }));
}

export interface SampleDef {
  id: string;
  name: string;
  description: string;
  input: SolveInput;
}

/**
 * 干净样例：SOS（... --- ...），单位时长恰好为 2，零偏差。
 * 游程：S(5段) 字母间隔 O(5段) 字母间隔 S(5段)。
 */
export const SAMPLE_CLEAN: SampleDef = {
  id: 'clean',
  name: '干净样例 SOS',
  description: '无噪声：点=2、划=6、符内=2、字母间隔=6，单位时长恰为 2',
  input: {
    runs: runsFromDurations([
      2, 2, 2, 2, 2, // S: · · ·
      6, // 字母间隔
      6, 2, 6, 2, 6, // O: − − −
      6, // 字母间隔
      2, 2, 2, 2, 2, // S: · · ·
    ]),
    unitMin: 1,
    unitMax: 4,
    alphabet: ['S', 'O'],
    dictionary: ['SOS'],
  },
};

/**
 * 受潮样例：同一条 SOS 纸带受潮变形，总偏差 6，单位时长仍为 2。
 */
export const SAMPLE_NOISY: SampleDef = {
  id: 'noisy',
  name: '受潮样例 SOS',
  description: '受潮噪声：时长抖动，需按总偏差最小复原，期望电文 SOS、单位 2、总偏差 6',
  input: {
    runs: runsFromDurations([
      3, 2, 2, 3, 2, // S（抖动）
      7, // 字母间隔（抖动）
      7, 2, 6, 3, 5, // O（抖动）
      6, // 字母间隔
      2, 2, 2, 2, 2, // S
    ]),
    unitMin: 1,
    unitMax: 4,
    alphabet: ['S', 'O'],
    dictionary: ['SOS'],
  },
};

/**
 * 无解样例：S O S O —— “SOSO” 不是词典单词，且结尾 “O” 无法落入任何
 * 有效词典前缀；最早失败位置在末段信号游程（下标 22）。
 */
export const SAMPLE_BROKEN: SampleDef = {
  id: 'broken',
  name: '无解样例 SOSO',
  description: '局部看似 SOS+O，但词典只有 SOS：结尾无法落入任何有效词典前缀',
  input: {
    runs: runsFromDurations([
      2, 2, 2, 2, 2, // S
      6,
      6, 2, 6, 2, 6, // O
      6,
      2, 2, 2, 2, 2, // S
      6,
      6, 2, 6, 2, 6, // O（词典中没有以 O 开头的词，SOSO 也不是词）
    ]),
    unitMin: 1,
    unitMax: 4,
    alphabet: ['S', 'O'],
    dictionary: ['SOS'],
  },
};

/**
 * 回读一致性样例：同一段 SOS 电文被连续发送两遍，中间以词间停顿（14 = 7×2）分隔。
 * 游程总数 35 = 4×8+3，正中第 18 段为分界词停顿；单位时长 2，零偏差。
 */
export const SAMPLE_READBACK: SampleDef = {
  id: 'readback',
  name: '回读样例 SOS×2',
  description: '同一条 SOS 连发两遍、词间停顿分隔：启用回读一致性后两遍逐字相同，零偏差',
  input: {
    runs: runsFromDurations([
      2, 2, 2, 2, 2, // S（第一遍）
      6, // 字母间隔
      6, 2, 6, 2, 6, // O
      6, // 字母间隔
      2, 2, 2, 2, 2, // S
      14, // 分界词间停顿（7×2）
      2, 2, 2, 2, 2, // S（第二遍）
      6, // 字母间隔
      6, 2, 6, 2, 6, // O
      6, // 字母间隔
      2, 2, 2, 2, 2, // S
    ]),
    unitMin: 1,
    unitMax: 4,
    alphabet: ['S', 'O'],
    dictionary: ['SOS'],
    readback: true,
  },
};

/**
 * 回读失败样例：两遍结构完全相同、正中确为词间停顿（23 = 4×5+3 段），
 * 但每遍电文是「SO」——词典只有 SOS，两遍都停在不是完整单词的位置，
 * 最早不能配对的字母在每遍末段（第 11 段）。
 */
export const SAMPLE_READBACK_FAIL: SampleDef = {
  id: 'readback-fail',
  name: '回读失配样例 SO×2',
  description: '两遍虽逐段同构，但每遍只能拼成 SO（非词典单词）：无法形成相同回读，且不显示任一单边电文',
  input: {
    runs: runsFromDurations([
      2, 2, 2, 2, 2, // S（第一遍）
      6, // 字母间隔
      6, 2, 6, 2, 6, // O（结尾不是词典完整单词）
      14, // 分界词间停顿（7×2）
      2, 2, 2, 2, 2, // S（第二遍，与第一遍逐段相同）
      6, // 字母间隔
      6, 2, 6, 2, 6, // O
    ]),
    unitMin: 1,
    unitMax: 4,
    alphabet: ['S', 'O'],
    dictionary: ['SOS'],
    readback: true,
  },
};

export const SAMPLES: SampleDef[] = [
  SAMPLE_CLEAN,
  SAMPLE_NOISY,
  SAMPLE_BROKEN,
  SAMPLE_READBACK,
  SAMPLE_READBACK_FAIL,
];
