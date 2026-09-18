import { describe, expect, it } from 'vitest';
import { TOP_K, solveOptimal, solveTopCandidates } from './tsp';
import { bruteForceOptimal, bruteForceTopK, makeRng, randomMatrix } from './brute';
import { routeCost } from './execution';

function factorial(x: number): number {
  let r = 1;
  for (let i = 2; i <= x; i++) r *= i;
  return r;
}

/**
 * 候选路线集（前三）验收：扩充全排列预言机，逐组核对随机小规模非对称矩阵的
 * 前三名费用与序列、数量不足时的实际数量、互异性，以及费用逐边复算。
 */
describe('候选路线集（前三）vs 全排列预言机', () => {
  const sizes = [1, 2, 3, 4, 5, 6, 7, 8];

  for (const m of sizes) {
    it(`目标数 m=${m}：多组随机非对称矩阵逐组核对前三名`, () => {
      for (let seed = 1; seed <= 30; seed++) {
        const dim = m + 1;
        const rng = makeRng(seed * 7919 + m * 31);
        const flat = randomMatrix(dim, rng);
        const targets = Array.from({ length: m }, (_, k) => k + 1);

        const top = solveTopCandidates(flat, dim, targets, 0, 0);
        const oracle = bruteForceTopK(flat, dim, targets, 0, 0, TOP_K);

        // 数量：不足三条时只返回实际数量，不占位、不重复
        expect(top.candidates).toHaveLength(oracle.length);
        expect(top.candidates).toHaveLength(Math.min(TOP_K, factorial(m)));

        const seen = new Set<string>();
        top.candidates.forEach((c, idx) => {
          expect(c.rank).toBe(idx + 1);
          expect(c.cost).toBe(oracle[idx]!.cost);
          expect(c.sequence).toEqual(oracle[idx]!.sequence);
          // 完整路径：从 0 出发、恰访 1..m 各一次、回到 0
          expect(c.tour).toEqual([0, ...c.sequence, 0]);
          expect([...c.sequence].sort((a, b) => a - b)).toEqual(targets);
          // 费用可由当前非对称矩阵逐边复算
          expect(routeCost(flat, dim, c.tour)).toBe(c.cost);
          // 互异
          const key = c.sequence.join(',');
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        });

        // 排名按总耗时非降
        for (let i = 1; i < top.candidates.length; i++) {
          expect(top.candidates[i]!.cost).toBeGreaterThanOrEqual(
            top.candidates[i - 1]!.cost,
          );
        }

        // 候选首名 == 原 solveOptimal == 单点穷举
        const opt = solveOptimal(flat, dim, targets, 0, 0);
        expect(top.candidates[0]!.cost).toBe(opt.cost);
        expect(top.candidates[0]!.sequence).toEqual(opt.sequence);
        expect(opt.cost).toBe(bruteForceOptimal(flat, dim, targets, 0, 0).cost);
      }
    });
  }

  it('可行路线不足三条时仅返回实际数量（m=1 → 1 条，m=2 → 2 条）', () => {
    // m=1：唯一路线 0→1→0 = 4+7 = 11
    const flat1 = [0, 4, 7, 0];
    const t1 = solveTopCandidates(flat1, 2, [1], 0, 0);
    expect(t1.candidates).toHaveLength(1);
    expect(t1.candidates[0]!.rank).toBe(1);
    expect(t1.candidates[0]!.tour).toEqual([0, 1, 0]);
    expect(t1.candidates[0]!.cost).toBe(11);

    // m=2：0→1→2→0 = 9 与 0→2→1→0 = 21，恰两条
    const flat2 = [
      0, 2, 5, // 0
      7, 0, 3, // 1
      4, 9, 0, // 2
    ];
    const t2 = solveTopCandidates(flat2, 3, [1, 2], 0, 0);
    expect(t2.candidates).toHaveLength(2);
    expect(t2.candidates[0]!.sequence).toEqual([1, 2]);
    expect(t2.candidates[0]!.cost).toBe(9);
    expect(t2.candidates[1]!.sequence).toEqual([2, 1]);
    expect(t2.candidates[1]!.cost).toBe(21);
  });

  it('全等费用 N=8：前三序列锁定为字典序前三', () => {
    const n = 8;
    const dim = n + 1;
    const flat = new Array<number>(dim * dim).fill(1);
    for (let i = 0; i < dim; i++) flat[i * dim + i] = 0;
    const targets = Array.from({ length: n }, (_, k) => k + 1);

    const top = solveTopCandidates(flat, dim, targets, 0, 0);
    expect(top.candidates).toHaveLength(3);
    expect(top.candidates.map((c) => c.cost)).toEqual([9, 9, 9]);
    expect(top.candidates[0]!.sequence).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(top.candidates[1]!.sequence).toEqual([1, 2, 3, 4, 5, 6, 8, 7]);
    expect(top.candidates[2]!.sequence).toEqual([1, 2, 3, 4, 5, 7, 6, 8]);
    for (const c of top.candidates) {
      expect(c.tour).toEqual([0, ...c.sequence, 0]);
      expect(routeCost(flat, dim, c.tour)).toBe(c.cost);
    }
  });

  it('任意起点与任意剩余子集的前三名也与穷举一致', () => {
    const rng = makeRng(555);
    const dim = 8;
    const flat = randomMatrix(dim, rng);
    const targets = [2, 3, 5, 7];
    const origin = 4;

    const top = solveTopCandidates(flat, dim, targets, origin, 0);
    const oracle = bruteForceTopK(flat, dim, targets, origin, 0, TOP_K);
    expect(top.candidates.map((c) => c.cost)).toEqual(oracle.map((o) => o.cost));
    expect(top.candidates.map((c) => c.sequence)).toEqual(oracle.map((o) => o.sequence));
    for (const c of top.candidates) {
      expect(c.tour[0]).toBe(origin);
      expect(c.tour[c.tour.length - 1]).toBe(0);
      expect(routeCost(flat, dim, c.tour)).toBe(c.cost);
    }
  });

  it('无目标时返回唯一的直达路线', () => {
    const flat = [0, 6, 9, 0];
    const top = solveTopCandidates(flat, 2, [], 1, 0);
    expect(top.candidates).toHaveLength(1);
    expect(top.candidates[0]!.tour).toEqual([1, 0]);
    expect(top.candidates[0]!.cost).toBe(9);
  });

  it('目标数量超过 18 抛错（候选表是有单最优表 3 倍的紧凑存储）', () => {
    const dim = 21;
    const flat = new Array<number>(dim * dim).fill(1);
    for (let i = 0; i < dim; i++) flat[i * dim + i] = 0;
    const targets = Array.from({ length: 19 }, (_, k) => k + 1);
    expect(() => solveTopCandidates(flat, dim, targets, 0, 0)).toThrow(/超出支持上限/);
  });
});
