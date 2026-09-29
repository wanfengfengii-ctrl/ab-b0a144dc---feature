import type { InterpretationType } from './types';

/**
 * 游程解释原语：信号游程可作点/划，空白游程可作符内/字母/词间隔。
 * 单遍求解与回读一致性求解共用同一套解释口径与编码。
 */

export interface SignalOption {
  sym: '.' | '-';
  units: number;
  type: InterpretationType;
  label: string;
  /** 决胜用解释编码：点=0，划=1。 */
  enc: string;
}

export const SIGNAL_OPTIONS: SignalOption[] = [
  { sym: '.', units: 1, type: 'dot', label: '点', enc: '0' },
  { sym: '-', units: 3, type: 'dash', label: '划', enc: '1' },
];

export interface GapOption {
  units: number;
  type: InterpretationType;
  label: string;
  /** 决胜用解释编码：符内=0，字母=1，词=2。 */
  enc: string;
}

export const GAP_OPTIONS: GapOption[] = [
  { units: 1, type: 'intra', label: '符内间隔', enc: '0' },
  { units: 3, type: 'letter', label: '字母间隔', enc: '1' },
  { units: 7, type: 'word', label: '词间隔', enc: '2' },
];

/** 词典 trie：节点编号即前缀，便于在 DP 状态中引用。 */
export interface Trie {
  children: Array<Map<string, number>>;
  terminal: boolean[];
  prefix: string[];
}

export function buildTrie(words: string[]): Trie {
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
