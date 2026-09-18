/**
 * 非对称旅行商精确求解：Held–Karp 动态规划。
 *
 * 不使用贪心，也不枚举全排列（m 个目标的排列数 m! 不可接受）。
 *
 * 状态定义（g 表，按“从某点出发并回家”的视角，便于执行中以新起点重排）：
 *   g[mask][i] = 从 target[i] 出发，恰好访问 mask 中全部目标（target[i] 不在 mask 内），
 *                最后回到 home 的最小耗时。
 *   g[0][i]    = C(target[i] -> home)
 *   g[mask][i] = min_{j ∈ mask} C(target[i] -> target[j]) + g[mask \\ {j}][j]
 *
 * 答案（从 origin 出发）：
 *   min_i C(origin -> target[i]) + g[full \\ {i}][i]
 *
 * 并列时取姿态序列字典序最小者：恢复路线时每一步在“仍能达到最优总耗时”的
 * 候选中选取编号最小的姿态。targets 按升序排列，按位从低到高枚举即编号升序，
 * 首个达到最小值的候选即为字典序最小选择，逐位贪心即得到全局字典序最小最优解。
 *
 * 复杂度 O(m^2 · 2^m) 时间、O(m · 2^m) 空间；m=18 时约 500 万次状态转移、约 19 MB。
 */

export interface OptimalRoute {
  /** 目标姿态访问顺序（不含起点 origin，不含结尾的 home） */
  sequence: number[];
  /** 完整路线 */
  tour: number[];
  /** 总耗时（含最后回到 home 的边） */
  cost: number;
  /** 目标姿态数量 */
  targetCount: number;
  /** 求解耗时（毫秒） */
  solveMs: number;
}

/** 候选路线：在精确最优基础上带名次（1 = 首名，即字典序最小的精确最优） */
export interface CandidateRoute extends OptimalRoute {
  /** 名次（1 起）：按总耗时升序、同费按完整姿态序列字典序升序 */
  rank: number;
}

export interface TopCandidatesResult {
  /** 互异候选路线，不足 TOP_K 条时只含实际数量（不占位、不重复） */
  candidates: CandidateRoute[];
  /** 整体求解耗时（毫秒） */
  solveMs: number;
}

/** 候选集固定大小：前三名 */
export const TOP_K = 3;

/**
 * 无穷远哨兵。注意：g 表是 Int32Array，fill 的值必须落在有符号 32 位范围内——
 * 1_000_000_000 会被截断成 0（曾静默污染整张表），故取 10_000_000：
 * 合法路线至多 20 边 × 9999 < 200_000，哨兵加上一条边后仍远超任何真实解。
 */
export const INF = 10_000_000;

function countTrailingZeros(x: number): number {
  // x 必为正整数（32 位内）。x & -x 隔离最低置位，再数其前导零。
  // 切勿写成 31 - clz32(x)：那是最高位索引，与 x & (x-1) 的最低位清位错配。
  return 31 - Math.clz32(x & -x);
}

/**
 * @param flat    行优先展开的方阵（dim × dim）
 * @param dim     方阵边长（= n + 1）
 * @param targets 需要访问的目标编号（会被复制并按升序排列）
 * @param origin  当前起点（原计划为 0；执行改序时为刚确认的姿态）
 * @param home    最终停放位（始终为 0）
 */
export function solveOptimal(
  flat: ArrayLike<number>,
  dim: number,
  targets: ArrayLike<number>,
  origin: number,
  home: number,
): OptimalRoute {
  const started =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  const m = targets.length;
  const sorted = Array.from(targets).sort((a, b) => a - b);

  const edge = (a: number, b: number): number => flat[a * dim + b]!;

  // 无目标：只剩 origin -> home 一条边（执行到最后一个姿态后，预计返回即此值）。
  if (m === 0) {
    const cost = edge(origin, home);
    return {
      sequence: [],
      tour: [origin, home],
      cost,
      targetCount: 0,
      solveMs: elapsedMs(started),
    };
  }
  if (m > 20) {
    throw new Error(`目标数量 ${m} 超出支持上限（20）`);
  }

  const size = 1 << m;
  const full = size - 1;

  // g[mask * m + i]，仅在 i ∉ mask 时有意义；密集存储换取简单索引。
  const g = new Int32Array(size * m).fill(INF);

  // 边界：mask = 0，从每个目标直接回家。
  for (let i = 0; i < m; i++) {
    g[i] = edge(sorted[i]!, home);
  }

  // 递推：去掉一个集合位后数值必然变小，故按 mask 数值升序即可保证依赖先算。
  for (let mask = 1; mask < size; mask++) {
    const rowBase = mask * m;
    let complement = full ^ mask;
    while (complement !== 0) {
      const i = countTrailingZeros(complement);
      complement &= complement - 1;

      const fromRow = sorted[i]! * dim;
      let members = mask;
      let best = INF;
      while (members !== 0) {
        const j = countTrailingZeros(members);
        members &= members - 1;

        const candidate =
          flat[fromRow + sorted[j]!]! + g[(mask ^ (1 << j)) * m + j]!;
        if (candidate < best) {
          best = candidate;
        }
      }
      g[rowBase + i] = best;
    }
  }

  // 逐位恢复字典序最小的最优路线。
  const sequence: number[] = [];
  const tour: number[] = [origin];
  let cur = origin;
  let remaining = full;
  let total = 0;

  while (remaining !== 0) {
    let chosen = -1;
    let chosenValue = INF;
    let bits = remaining; // sorted 升序 ⇒ 低位到高位即姿态编号升序
    while (bits !== 0) {
      const b = countTrailingZeros(bits);
      bits &= bits - 1;

      const value =
        edge(cur, sorted[b]!) + g[(remaining ^ (1 << b)) * m + b]!;
      if (value < chosenValue) {
        chosenValue = value;
        chosen = b;
      }
    }
    const nextPose = sorted[chosen]!;
    sequence.push(nextPose);
    tour.push(nextPose);
    total += edge(cur, nextPose);
    cur = nextPose;
    remaining &= ~(1 << chosen); // 从剩余集合移除该位（位掩码写法，避免优先级陷阱）
  }

  total += edge(cur, home);
  tour.push(home);

  return {
    sequence,
    tour,
    cost: total,
    targetCount: m,
    solveMs: elapsedMs(started),
  };
}

function elapsedMs(started: number): number {
  const now =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  return now - started;
}

/**
 * 候选路线集：一次 Held–Karp 求出按“总耗时升序、同费按完整姿态序列字典序升序”的
 * 前三条互异精确路线。不是靠禁用首选路线的边反复调用单最优求解器，而是把每个
 * DP 状态从单个最优值扩展为固定 TOP_K 个不同后缀及其子排名：
 *
 *   best[mask][i][r] = 从 target[i] 出发、恰好访问 mask 中全部目标、最后回到 home
 *                      的第 r+1 好的互异后缀耗时（r = 0..TOP_K-1）
 *   pick[mask][i][r] = 该后缀的第一步选择：j * TOP_K + r'，表示下一段走 target[j]，
 *                      并接 best[mask\{j}][j][r']（确定性恢复的指针）
 *
 * 递推时把每个 j ∈ mask 的子状态候选（已按 (费用, 序列字典序) 排好）按
 * (总费用, j 升序, 子排名升序) 归并取前三。该比较键与全局排序键等价：
 * 同费时先比首姿态编号（即 j），同 j 时子序列顺序即子排名顺序。
 * 同一 (j, 子排名) 唯一确定一条后缀，不同候选对天然互异，故归并结果即
 * 该状态全部互异后缀的前三名——标准 k-best 最优子结构成立：
 * 若某后缀的子后缀排在子状态前三之外，则至少有 TOP_K 条完整后缀严格排在它前面。
 *
 * 存储保持紧凑：costs 用 Int32Array、pick 用 Uint8Array（j*TOP_K+r' ≤ 59，0xFF 为空），
 * m=18 时约 57 MB + 14 MB。恢复路线只沿 pick 指针走，完全确定。
 */
export function solveTopCandidates(
  flat: ArrayLike<number>,
  dim: number,
  targets: ArrayLike<number>,
  origin: number,
  home: number,
): TopCandidatesResult {
  const started =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  const m = targets.length;
  const sorted = Array.from(targets).sort((a, b) => a - b);

  const edge = (a: number, b: number): number => flat[a * dim + b]!;

  // 无目标：只剩 origin -> home 一条边，唯一一条“路线”。
  if (m === 0) {
    const cost = edge(origin, home);
    const solveMs = elapsedMs(started);
    return {
      candidates: [
        { rank: 1, sequence: [], tour: [origin, home], cost, targetCount: 0, solveMs },
      ],
      solveMs,
    };
  }
  if (m > 18) {
    // 候选表是单最优表的 TOP_K 倍，m=18 已约 71 MB；计划域 N ≤ 18，足够。
    throw new Error(`候选求解目标数量 ${m} 超出支持上限（18）`);
  }

  const K = TOP_K;
  const EMPTY = 0xff;
  const size = 1 << m;
  const full = size - 1;

  // best[(mask * m + i) * K + r]，仅 i ∉ mask 时有意义；pick 同形。
  const costs = new Int32Array(size * m * K).fill(INF);
  const pick = new Uint8Array(size * m * K).fill(EMPTY);

  // 边界：mask = 0，从每个目标直接回家，只有第 1 名。
  for (let i = 0; i < m; i++) {
    costs[i * K] = edge(sorted[i]!, home);
  }

  // 递推：按 mask 数值升序，依赖（去掉一位）必然先算。
  for (let mask = 1; mask < size; mask++) {
    const rowBase = mask * m * K;
    let complement = full ^ mask;
    while (complement !== 0) {
      const i = countTrailingZeros(complement);
      complement &= complement - 1;

      const fromRow = sorted[i]! * dim;
      // 归并 j ∈ mask 的子候选，按 (费用, j, 子排名) 取前三；标量槽避免内层分配。
      let c1 = INF;
      let p1 = EMPTY;
      let c2 = INF;
      let p2 = EMPTY;
      let c3 = INF;
      let p3 = EMPTY;
      let members = mask;
      while (members !== 0) {
        const j = countTrailingZeros(members);
        members &= members - 1;

        const e = flat[fromRow + sorted[j]!]!;
        const childBase = ((mask ^ (1 << j)) * m + j) * K;
        for (let r = 0; r < K; r++) {
          const child = costs[childBase + r]!;
          if (child >= INF) break; // 子排名费用非降，之后全是空槽
          const cand = e + child;
          const packed = j * K + r;
          // 严格小于才前移：枚举顺序已是 (j 升序, r 升序)，同费时先枚举者排前
          if (cand < c1) {
            c3 = c2;
            p3 = p2;
            c2 = c1;
            p2 = p1;
            c1 = cand;
            p1 = packed;
          } else if (cand < c2) {
            c3 = c2;
            p3 = p2;
            c2 = cand;
            p2 = packed;
          } else if (cand < c3) {
            c3 = cand;
            p3 = packed;
          }
        }
      }
      const slot = rowBase + i * K;
      costs[slot] = c1;
      pick[slot] = p1;
      costs[slot + 1] = c2;
      pick[slot + 1] = p2;
      costs[slot + 2] = c3;
      pick[slot + 2] = p3;
    }
  }

  // 顶层归并：从 origin 出发的第一步，同样按 (总费用, 首姿态, 子排名) 取前三。
  const topCost: number[] = [];
  const topPick: number[] = [];
  {
    let c1 = INF;
    let p1 = EMPTY;
    let c2 = INF;
    let p2 = EMPTY;
    let c3 = INF;
    let p3 = EMPTY;
    for (let i = 0; i < m; i++) {
      const e = edge(origin, sorted[i]!);
      const stateBase = ((full ^ (1 << i)) * m + i) * K;
      for (let r = 0; r < K; r++) {
        const child = costs[stateBase + r]!;
        if (child >= INF) break;
        const cand = e + child;
        const packed = i * K + r;
        if (cand < c1) {
          c3 = c2;
          p3 = p2;
          c2 = c1;
          p2 = p1;
          c1 = cand;
          p1 = packed;
        } else if (cand < c2) {
          c3 = c2;
          p3 = p2;
          c2 = cand;
          p2 = packed;
        } else if (cand < c3) {
          c3 = cand;
          p3 = packed;
        }
      }
    }
    if (c1 < INF) {
      topCost.push(c1);
      topPick.push(p1);
    }
    if (c2 < INF) {
      topCost.push(c2);
      topPick.push(p2);
    }
    if (c3 < INF) {
      topCost.push(c3);
      topPick.push(p3);
    }
  }

  // 沿 pick 指针确定性地恢复每条候选（不再排序、不再搜索）。
  const candidates: CandidateRoute[] = [];
  for (let q = 0; q < topPick.length; q++) {
    const sequence: number[] = [];
    const tour: number[] = [origin];
    let cur = origin;
    let total = 0;
    let mask = full;
    let packed = topPick[q]!;
    for (;;) {
      const idx = (packed / K) | 0;
      const rank = packed % K;
      const pose = sorted[idx]!;
      sequence.push(pose);
      tour.push(pose);
      total += edge(cur, pose);
      cur = pose;
      mask &= ~(1 << idx); // 从剩余集合移除该位
      if (mask === 0) break;
      packed = pick[(mask * m + idx) * K + rank]!;
    }
    total += edge(cur, home);
    tour.push(home);
    candidates.push({
      rank: q + 1,
      sequence,
      tour,
      cost: total,
      targetCount: m,
      solveMs: 0, // 统一在末尾赋值
    });
  }

  const solveMs = elapsedMs(started);
  for (const c of candidates) c.solveMs = solveMs;
  return { candidates, solveMs };
}
