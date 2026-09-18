import { useEffect, useMemo, useState } from 'react';
import { type CalibrationPlan, createDefaultPlan } from './solver/plan';
import { solveTopCandidates } from './solver/tsp';
import { MatrixEditor } from './components/MatrixEditor';
import { ExecutionConsole } from './components/ExecutionConsole';
import { loadPlan, savePlan } from './state/storage';

type Tab = 'edit' | 'execute';

export function App() {
  const [plan, setPlan] = useState<CalibrationPlan>(() => {
    const fallback = createDefaultPlan(12);
    return loadPlan(fallback);
  });
  const [tab, setTab] = useState<Tab>('edit');
  const [planVersion, setPlanVersion] = useState(0); // 进入执行台时重建执行状态
  const [selectedIdx, setSelectedIdx] = useState(0); // 候选集选择，默认首名

  function applyPlan(next: CalibrationPlan) {
    savePlan(next);
    setPlan(next);
  }

  function resetToDefault() {
    const fallback = createDefaultPlan(12);
    savePlan(fallback);
    setPlan(fallback);
  }

  // 当前已生效计划的候选路线集（前三条互异精确路线，一次求解）
  const targets = useMemo(() => Array.from({ length: plan.n }, (_, k) => k + 1), [plan.n]);
  const top = useMemo(
    () => solveTopCandidates(plan.matrixFlat, plan.n + 1, targets, 0, 0),
    [plan, targets],
  );

  // 应用新矩阵（含恢复默认）后，旧候选与选择一起失效：回到首名并展示新结果
  useEffect(() => {
    setSelectedIdx(0);
  }, [plan]);

  const selected =
    top.candidates[Math.min(selectedIdx, top.candidates.length - 1)] ?? top.candidates[0]!;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>穹幕投影机校准 · 精确路线台</h1>
          <div className="sub">
            镜组转动耗时有方向性 · 非对称 TSP 精确解（Held–Karp 动态规划，非贪心、非全排列）
            · 数据仅存本浏览器
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={resetToDefault}>
            恢复默认计划（N=12）
          </button>
        </div>
      </header>

      <nav className="tabs">
        <button
          className={`tab ${tab === 'edit' ? 'active' : ''}`}
          onClick={() => setTab('edit')}
        >
          1. 编辑与导入
        </button>
        <button
          className={`tab ${tab === 'execute' ? 'active' : ''}`}
          onClick={() => {
            setPlanVersion((v) => v + 1);
            setTab('execute');
          }}
        >
          2. 开始执行
          </button>
      </nav>

      {tab === 'edit' && (
        <>
          <div className="panel">
            <h2>当前已生效计划的精确解 · 校准路线候选集</h2>
            <div className="metric-grid">
              <div className="metric">
                <div className="label">姿态数 N</div>
                <div className="value">{plan.n}</div>
              </div>
              <div className="metric">
                <div className="label">首名总耗时（精确最优）</div>
                <div className="value good">{top.candidates[0]!.cost}</div>
              </div>
              <div className="metric">
                <div className="label">互异候选数</div>
                <div className="value">{top.candidates.length}</div>
              </div>
              <div className="metric">
                <div className="label">候选集求解耗时</div>
                <div className="value" style={{ fontSize: 15 }}>
                  {top.solveMs.toFixed(2)} ms
                </div>
              </div>
            </div>

            <div className="candidate-list" role="radiogroup" aria-label="校准路线候选集">
              {top.candidates.map((c, idx) => (
                <label
                  key={c.rank}
                  className={`candidate ${idx === selectedIdx ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="route-candidate"
                    checked={idx === selectedIdx}
                    onChange={() => setSelectedIdx(idx)}
                    aria-label={`选择第 ${c.rank} 名候选路线`}
                  />
                  <div className="candidate-body">
                    <div className="candidate-head">
                      <span className={`badge ${idx === 0 ? 'good' : 'warn'}`}>
                        第 {c.rank} 名
                      </span>
                      <span className="candidate-cost">总耗时 {c.cost}</span>
                      {idx === 0 && <span className="muted">精确最优 · 默认选择</span>}
                      {idx === selectedIdx && idx !== 0 && (
                        <span className="muted">已改选为执行基线</span>
                      )}
                    </div>
                    <div className="route-line">
                      {c.tour.map((node, nodeIdx) => (
                        <span key={nodeIdx}>
                          <span className={`node ${node === 0 ? 'home' : ''}`}>{node}</span>
                          {nodeIdx < c.tour.length - 1 && <span className="arrow">→</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <div className="hint">
              按总耗时升序、同费按姿态序列字典序升序排列的前三条互异精确路线；每条恰访 1—N
              各一次并回到 0，费用可按当前矩阵逐边复算。默认选择首名，可改选后进入执行台；
              执行台以所选候选为原计划与增量基线。改完矩阵请点“校验并应用”，候选集在此即时重算。
            </div>
          </div>

          <MatrixEditor plan={plan} onApply={applyPlan} />
        </>
      )}

      {tab === 'execute' && (
        <ExecutionConsole
          key={planVersion}
          plan={plan}
          candidate={selected}
          onAbort={() => setTab('edit')}
        />
      )}
    </div>
  );
}
