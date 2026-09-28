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

export const SAMPLES: SampleDef[] = [SAMPLE_CLEAN, SAMPLE_NOISY, SAMPLE_BROKEN];
