/**
 * 测试专用：全排列枚举基准。
 * 仅用于 Vitest 穷举小样本核对，产品代码禁止使用它。
 */

export interface BruteResult {
  sequence: number[];
  cost: number;
}

/**
 * 枚举 targets 的全部排列（字典序生成），计算
 * origin -> 排列 -> home 的费用，返回最小费用；并列取序列字典序最小。
 */
export function bruteForceOptimal(
  flat: ArrayLike<number>,
  dim: number,
  targetsIn: ArrayLike<number>,
  origin: number,
  home: number,
): BruteResult {
  const targets = Array.from(targetsIn).sort((a, b) => a - b);
  let best = Infinity;
  let bestSeq: number[] = [];

  const edge = (a: number, b: number) => flat[a * dim + b]!;

  const visit = (perm: number[], used: boolean[], cost: number, last: number) => {
    if (perm.length === targets.length) {
      const total = cost + edge(last, home);
      // targets 升序且回溯按索引升序，首个排列即字典序最小，用严格小于保持之
      if (total < best) {
        best = total;
        bestSeq = perm.slice();
      }
      return;
    }
    for (let i = 0; i < targets.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      perm.push(targets[i]!);
      visit(perm, used, cost + edge(last, targets[i]!), targets[i]!);
      perm.pop();
      used[i] = false;
    }
  };

  visit([], new Array(targets.length).fill(false), 0, origin);
  return { sequence: bestSeq, cost: best };
}

/**
 * 全排列预言机（前 k 名）：枚举 targets 的全部排列，按
 * “总费用升序、同费按姿态序列字典序升序”排序后取前 k 条。
 * 排列两两不同，故结果天然互异；排列不足 k 条时只返回实际数量。
 */
export function bruteForceTopK(
  flat: ArrayLike<number>,
  dim: number,
  targetsIn: ArrayLike<number>,
  origin: number,
  home: number,
  k = 3,
): BruteResult[] {
  const targets = Array.from(targetsIn).sort((a, b) => a - b);
  const all: BruteResult[] = [];

  const edge = (a: number, b: number) => flat[a * dim + b]!;

  const visit = (perm: number[], used: boolean[], cost: number, last: number) => {
    if (perm.length === targets.length) {
      all.push({ sequence: perm.slice(), cost: cost + edge(last, home) });
      return;
    }
    for (let i = 0; i < targets.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      perm.push(targets[i]!);
      visit(perm, used, cost + edge(last, targets[i]!), targets[i]!);
      perm.pop();
      used[i] = false;
    }
  };

  visit([], new Array(targets.length).fill(false), 0, origin);
  all.sort((a, b) => a.cost - b.cost || compareSequenceLex(a.sequence, b.sequence));
  return all.slice(0, k);
}

/** 姿态序列字典序比较（短的公共前缀相同则短者在前） */
export function compareSequenceLex(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i]! - b[i]!;
  }
  return a.length - b.length;
}

/** 可复现的简单伪随机数（mulberry32） */export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 生成 dim×dim 随机非对称费用矩阵（对角 0） */
export function randomMatrix(dim: number, rng: () => number): number[] {
  const flat = new Array<number>(dim * dim).fill(0);
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      if (i !== j) flat[i * dim + j] = 1 + Math.floor(rng() * 9999);
    }
  }
  return flat;
}
