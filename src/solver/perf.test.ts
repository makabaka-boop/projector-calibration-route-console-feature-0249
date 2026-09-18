import { describe, expect, it } from 'vitest';
import { solveOptimal, solveTopCandidates } from './tsp';
import { startExecution, confirmNext, finishReturn, routeCost } from './execution';
import { makeRng, randomMatrix } from './brute';

/**
 * 验收硬指标：N=18（19×19 非对称矩阵）的精确求解必须在 4 秒内完成；
 * 现场每次改序都要对剩余姿态重算，因此逐拍计时也必须达标。
 */
describe('性能：N=18 停机窗口', () => {
  it('单次 Held–Karp（18 目标）< 4 秒', () => {
    const n = 18;
    const flat = randomMatrix(n + 1, makeRng(2026));
    const r = solveOptimal(flat, n + 1, Array.from({ length: n }, (_, k) => k + 1), 0, 0);
    expect(r.cost).toBeGreaterThan(0);
    expect(r.sequence).toHaveLength(18);
    expect(new Set(r.sequence).size).toBe(18);
    // 打印实际耗时，供验收留痕
    console.log(`N=18 单次求解耗时：${r.solveMs.toFixed(1)} ms`);
    expect(r.solveMs).toBeLessThan(4000);
  });

  it('N=18 一次生成三条互异候选 < 4 秒', () => {
    const n = 18;
    const flat = randomMatrix(n + 1, makeRng(20260918));
    const targets = Array.from({ length: n }, (_, k) => k + 1);
    const top = solveTopCandidates(flat, n + 1, targets, 0, 0);

    expect(top.candidates).toHaveLength(3);
    const seen = new Set<string>();
    top.candidates.forEach((c, idx) => {
      expect(c.rank).toBe(idx + 1);
      // 恰访 1..N 一次，从 0 出发回到 0
      expect(c.sequence).toHaveLength(18);
      expect(new Set(c.sequence).size).toBe(18);
      expect(c.tour).toEqual([0, ...c.sequence, 0]);
      // 费用逐边复算
      expect(routeCost(flat, n + 1, c.tour)).toBe(c.cost);
      seen.add(c.sequence.join(','));
    });
    expect(seen.size).toBe(3); // 互异
    // 排名按总耗时非降；首名等于单最优
    expect(top.candidates[1]!.cost).toBeGreaterThanOrEqual(top.candidates[0]!.cost);
    expect(top.candidates[2]!.cost).toBeGreaterThanOrEqual(top.candidates[1]!.cost);
    const opt = solveOptimal(flat, n + 1, targets, 0, 0);
    expect(top.candidates[0]!.cost).toBe(opt.cost);
    expect(top.candidates[0]!.sequence).toEqual(opt.sequence);

    console.log(`N=18 候选集（前三）求解耗时：${top.solveMs.toFixed(1)} ms`);
    expect(top.solveMs).toBeLessThan(4000);
  });

  it('现场逐步偏离：每一拍重排（含满 18 目标起步）均 < 4 秒', () => {
    const n = 18;
    const flat = randomMatrix(n + 1, makeRng(2027));
    let state = startExecution(plan(flat));
    const timings: number[] = [state.suffix.solveMs];
    expect(state.suffix.solveMs).toBeLessThan(4000);

    // 每一步都故意选“非推荐”的姿态，最坏现场情形
    const order = [9, 18, 1, 10, 17, 2, 8, 11, 3, 16, 7, 12, 4, 15, 6, 13, 5, 14];
    for (const pose of order) {
      state = confirmNext(state, pose);
      timings.push(state.suffix.solveMs);
      expect(state.suffix.solveMs).toBeLessThan(4000);
    }
    state = finishReturn(state);
    expect(state.finished).toBe(true);
    console.log(
      `N=18 逐步重排耗时（ms）：${timings.map((t) => t.toFixed(1)).join(', ')}`,
    );
  });

  function plan(flat: number[]) {
    return { n: 18, matrixFlat: flat };
  }
});
