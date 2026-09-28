/**
 * 摩尔斯电码表（仅限字母；本应用面向受限字母表场景）。
 */
export const MORSE_CODE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.',
  G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..',
  M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.',
  S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
  Y: '-.--', Z: '--..',
};

/** 摩尔斯码 -> 字母 的反查表。 */
export const MORSE_TO_CHAR: Record<string, string> = Object.fromEntries(
  Object.entries(MORSE_CODE).map(([ch, code]) => [code, ch]),
);
