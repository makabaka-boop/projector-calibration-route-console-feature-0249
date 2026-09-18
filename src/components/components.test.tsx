// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MatrixEditor } from './MatrixEditor';
import { ExecutionConsole } from './ExecutionConsole';
import { App } from '../App';
import { type CalibrationPlan, createDefaultPlan } from '../solver/plan';
import { solveTopCandidates } from '../solver/tsp';

function planWith(n: number, edge = 1): CalibrationPlan {
  const p = createDefaultPlan(n);
  if (edge !== 1) {
    for (let i = 0; i < p.matrixFlat.length; i++) p.matrixFlat[i] = p.matrixFlat[i] === 0 ? 0 : edge;
  }
  return p;
}

describe('MatrixEditor 组件', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('缺项使整批拒绝：就地显示错误，onApply 不被调用（旧计划保留）', () => {
    const spy = vi.fn();
    render(<MatrixEditor plan={planWith(8)} onApply={spy} />);

    // 找到 matrix[1][2] 输入并清空（制造缺项）
    const input = document.querySelector('input[aria-label="matrix[1][2]"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: /校验并应用/ }));

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('matrix[1][2]');
    expect(alert.textContent).toContain('整批拒绝');
    expect(spy).not.toHaveBeenCalled();
  });

  it('合法编辑可以应用，且无效 JSON 就地报错', () => {
    let applied: CalibrationPlan | null = null;
    render(<MatrixEditor plan={planWith(8)} onApply={(p) => (applied = p)} />);

    // 合法改动：matrix[0][1] = 42
    const input = document.querySelector('input[aria-label="matrix[0][1]"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: /校验并应用/ }));
    expect(applied).not.toBeNull();
    expect(applied!.matrixFlat[1]).toBe(42);

    // 非法 JSON
    fireEvent.change(screen.getByPlaceholderText(/n/), { target: { value: '{not json' } });
    fireEvent.click(screen.getByRole('button', { name: /解析并载入草稿/ }));
    expect(screen.getByRole('alert').textContent).toContain('JSON 语法错误');
  });

  it('越界值（10000）就地标红并被拒绝', () => {
    render(<MatrixEditor plan={planWith(8)} onApply={() => {}} />);
    const input = document.querySelector('input[aria-label="matrix[3][4]"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '10000' } });
    expect(input.classList.contains('invalid')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /校验并应用/ }));
    expect(screen.getByRole('alert').textContent).toContain('matrix[3][4]');
  });

  it('对角线输入被锁定（不可编辑，恒为 0）', () => {
    render(<MatrixEditor plan={planWith(8)} onApply={() => {}} />);
    const diag = document.querySelector('input[aria-label="matrix[5][5]"]') as HTMLInputElement;
    expect(diag.disabled).toBe(true);
    expect(diag.value).toBe('0');
  });
});

describe('App 候选路线集', () => {
  beforeEach(() => localStorage.clear());

  it('一次给出前三条候选：排名/总耗时/完整路径齐全，默认选择首名', () => {
    render(<App />);
    // 默认计划 N=12 等费：三条候选，费用均为 13
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios).toHaveLength(3);
    expect(radios[0]!.checked).toBe(true); // 默认首名
    expect(screen.getByText('第 1 名')).toBeTruthy();
    expect(screen.getByText('第 2 名')).toBeTruthy();
    expect(screen.getByText('第 3 名')).toBeTruthy();
    expect(screen.getAllByText('总耗时 13')).toHaveLength(3);
    // 完整路径从 0 出发回到 0（每条候选 14 个节点，含首尾两个 0）
    const group = screen.getByRole('radiogroup', { name: '校准路线候选集' });
    expect(group.textContent).toContain('13');
  });

  it('工程师可改选候选，执行台以所选候选为原计划基线', () => {
    render(<App />);
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    fireEvent.click(radios[1]!); // 改选第 2 名
    expect(radios[1]!.checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /开始执行/ }));
    expect(screen.getByText('原计划总耗时（第 2 名候选）')).toBeTruthy();
    expect(screen.getByText('原计划：第 2 名候选路线（增量基线）')).toBeTruthy();
  });

  it('应用新矩阵后旧候选与选择一起失效：选择复位首名并展示新结果', () => {
    render(<App />);
    let radios = screen.getAllByRole('radio') as HTMLInputElement[];
    fireEvent.click(radios[2]!); // 改选第 3 名
    expect(radios[2]!.checked).toBe(true);

    // 改一格费用并应用新矩阵
    const input = document.querySelector('input[aria-label="matrix[0][1]"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: /校验并应用/ }));

    // 选择复位到首名；首名总耗时随新矩阵更新（0→1 边变贵，最优绕开它，费用仍可为 13）
    radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios[0]!.checked).toBe(true);
    expect(screen.getByText('第 1 名')).toBeTruthy();
  });
});

describe('ExecutionConsole 组件', () => {
  beforeEach(() => localStorage.clear());

  it('确认姿态后：累计费用/预计完工更新；已完成姿态禁用，推荐站标注', () => {
    const plan = planWith(8, 5); // 每边费用 5
    render(<ExecutionConsole plan={plan} onAbort={() => {}} />);

    // 初始：已发生 0；所有姿态按钮可点
    expect(screen.getByText('已发生费用')).toBeTruthy();
    const pose3 = screen.getByTitle(/确认姿态 3/) as HTMLButtonElement;
    expect(pose3.disabled).toBe(false);

    fireEvent.click(pose3);

    // 已发生费用应为 0->3 = 5
    const metrics = screen.getAllByText('5');
    expect(metrics.length).toBeGreaterThan(0);

    // 姿态 3 现在禁用
    expect(pose3.disabled).toBe(true);
    expect(pose3.title).toContain('不得再次确认');

    // 推荐下一站（等费时字典序最小 = 1）
    const pose1 = screen.getByTitle(/确认姿态 1/) as HTMLButtonElement;
    expect(pose1.classList.contains('recommended')).toBe(true);

    // 再确认 1
    fireEvent.click(pose1);
    expect(pose1.disabled).toBe(true);

    // 已完成 3、1，剩余 6 个
    expect(screen.getByText(/剩余 6 个姿态/)).toBeTruthy();
  });

  it('偏离最优后增量为非负，全部完成后可回库并显示最终台账', () => {
    const plan = planWith(8, 7);
    render(<ExecutionConsole plan={plan} onAbort={() => {}} />);
    for (const p of [1, 2, 3, 4, 5, 6, 7, 8]) {
      fireEvent.click(screen.getByTitle(`确认姿态 ${p} 为下一站，本步镜组转动费用 7`));
    }
    fireEvent.click(screen.getByRole('button', { name: /返回停放位/ }));
    expect(screen.getByText('已回到停放位 0，结案')).toBeTruthy();
    // 等费矩阵：实际总耗时 = 9 条边 × 7 = 63，无增量（多个指标卡均显示 63）
    expect(screen.getAllByText('63').length).toBeGreaterThan(0);
    expect(screen.getByText(/0（与原计划一致）/)).toBeTruthy();
  });

  it('禁止提前回库：未全部完成时没有回库按钮', () => {
    render(<ExecutionConsole plan={planWith(8, 1)} onAbort={() => {}} />);
    expect(screen.queryByRole('button', { name: /返回停放位/ })).toBeNull();
  });

  it('以次优候选为基线：沿精确后缀走完全程，增量为负并载入台账', () => {
    // 便宜有向环 0→1→…→8→0（每边 1），其余边 100：最优 9，次名 108
    const n = 8;
    const dim = n + 1;
    const flat = new Array<number>(dim * dim).fill(100);
    for (let i = 0; i < dim; i++) flat[i * dim + i] = 0;
    for (let k = 0; k < n; k++) flat[k * dim + (k + 1)] = 1;
    flat[n * dim + 0] = 1;
    const plan: CalibrationPlan = { n, matrixFlat: flat };

    const top = solveTopCandidates(flat, dim, Array.from({ length: n }, (_, k) => k + 1), 0, 0);
    expect(top.candidates).toHaveLength(3);
    const chosen = top.candidates[1]!; // 第 2 名（次优基线）
    expect(chosen.cost).toBeGreaterThan(top.candidates[0]!.cost);

    render(<ExecutionConsole plan={plan} candidate={chosen} onAbort={() => {}} />);

    // 基线展示为第 2 名候选
    expect(screen.getByText('原计划总耗时（第 2 名候选）')).toBeTruthy();
    expect(screen.getByText(`原计划：第 2 名候选路线（增量基线）`)).toBeTruthy();

    // 沿精确后缀推荐（1→2→…→8）逐站确认
    for (const p of [1, 2, 3, 4, 5, 6, 7, 8]) {
      fireEvent.click(screen.getByTitle(new RegExp(`确认姿态 ${p} 为下一站`)));
    }
    fireEvent.click(screen.getByRole('button', { name: /返回停放位/ }));

    // 实际总耗时 = 精确最优 9，低于所选次优基线 → 增量为负
    const expectedDelta = 9 - chosen.cost;
    expect(expectedDelta).toBeLessThan(0);
    expect(screen.getByText(`${expectedDelta}（优于所选候选）`)).toBeTruthy();
  });
});
