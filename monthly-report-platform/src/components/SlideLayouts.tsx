import type { ClearanceRow, CompanyMetric, PageCopy, ReportPage, SpaceResourceRow } from "../../shared/report";
import { numberText, pct, pp } from "../lib/format";

const MAX_BAR = 120;

function deltaClass(value: number | null | undefined, invert = false) {
  if (value == null || value === 0) return "tone-neutral";
  const good = invert ? value < 0 : value > 0;
  return good ? "tone-green" : "tone-red";
}

function clampPercent(value: number | null | undefined, max = 100) {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(value, max));
}

function firstNumber(value: string) {
  const match = value.match(/[+-]?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function InsightList({ copy, page, compact = false }: { copy: PageCopy; page: ReportPage; compact?: boolean }) {
  const lines = [copy.mainConclusion || page.bullets[0], copy.reason || page.bullets[1]].filter(Boolean);
  return (
    <section className={compact ? "ppt-insights compact" : "ppt-insights"}>
      {lines.slice(0, 2).map((line, index) => (
        <div className="ppt-insight" key={index}>
          <span>{index + 1}</span>
          <p>{line}</p>
        </div>
      ))}
    </section>
  );
}

function VerticalBarChart({
  rows,
  previousLabel,
  currentLabel,
  target,
  invertDelta = false,
  compact = false
}: {
  rows: CompanyMetric[];
  previousLabel: string;
  currentLabel: string;
  target?: number | null;
  invertDelta?: boolean;
  compact?: boolean;
}) {
  const ticks = compact ? [100, 80, 60, 40, 20, 0] : [120, 100, 80, 60, 40, 20, 0];
  const max = compact ? 105 : MAX_BAR;
  const targetTop = target == null ? undefined : `${100 - clampPercent(target, max) / max * 100}%`;
  return (
    <div className={compact ? "ppt-bars compact" : "ppt-bars"}>
      <div className="ppt-chart-legend">
        <span><i className="legend-prev" />{previousLabel}</span>
        <span><i className="legend-current" />{currentLabel}</span>
      </div>
      <div className="ppt-bar-plot">
        <div className="ppt-y-axis">
          {ticks.map((tick) => (
            <span key={tick} style={{ top: `${100 - tick / max * 100}%` }}>{tick}%</span>
          ))}
        </div>
        <div className="ppt-grid">
          {ticks.map((tick) => (
            <span key={tick} style={{ top: `${100 - tick / max * 100}%` }} />
          ))}
          {targetTop ? <em style={{ top: targetTop }} /> : null}
        </div>
        <div className="ppt-bar-groups" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
          {rows.map((row) => (
            <div className="ppt-bar-group" key={row.company}>
              <div className="ppt-value-pair">
                <span>{pct(row.previous)}</span>
                <span>{pct(row.current)}</span>
              </div>
              <div className="ppt-bar-pair">
                <b className="prev" style={{ height: `${clampPercent(row.previous, max) / max * 100}%` }} />
                <b className="current" style={{ height: `${clampPercent(row.current, max) / max * 100}%` }} />
              </div>
              <strong>{row.company}</strong>
              <em className={deltaClass(row.delta, invertDelta)}>{pp(row.delta)}</em>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HorizontalRateList({
  rows,
  valueKey = "current",
  compareKey,
  invertDelta = false,
  limit = 16
}: {
  rows: CompanyMetric[];
  valueKey?: keyof CompanyMetric;
  compareKey?: keyof CompanyMetric;
  invertDelta?: boolean;
  limit?: number;
}) {
  const data = rows.slice(0, limit);
  return (
    <div className="ppt-rate-list">
      {data.map((row) => {
        const value = Number(row[valueKey] ?? 0);
        const compare = compareKey ? Number(row[compareKey] ?? 0) : undefined;
        return (
          <div className="ppt-rate-row" key={row.company}>
            <span>{row.company}</span>
            <div className="ppt-rate-track">
              <b style={{ width: `${clampPercent(value, 100)}%` }} />
            </div>
            <strong>{pct(value)}</strong>
            {compareKey ? <em className={deltaClass(compare, invertDelta)}>{pp(compare)}</em> : null}
          </div>
        );
      })}
    </div>
  );
}

function SummarySentence({ page }: { page: ReportPage }) {
  return (
    <div className="ppt-summary-sentence">
      {page.metrics.map((metric, index) => (
        <div className="ppt-summary-piece" key={metric.label}>
          <span>{metric.label}</span>
          <strong className={`tone-${metric.tone || "blue"}`}>{metric.value}</strong>
          {metric.sublabel ? <em>{metric.sublabel}</em> : null}
          {index < page.metrics.length - 1 ? <i /> : null}
        </div>
      ))}
    </div>
  );
}

export function SlideBody({ page, copy }: { page: ReportPage; copy: PageCopy }) {
  switch (page.layout) {
    case "split-two-charts":
      return <SplitTwoChartsSlide page={page} copy={copy} />;
    case "clearance-table":
      return <ClearanceSlide page={page} copy={copy} />;
    case "space-progress":
      return <SpaceSlide page={page} copy={copy} />;
    case "charging-dashboard":
      return <ChargingSlide page={page} copy={copy} />;
    case "repair-dashboard":
      return <RepairSlide page={page} copy={copy} />;
    case "complaints-dashboard":
      return <ComplaintsSlide page={page} copy={copy} />;
    default:
      return <OverviewBarsSlide page={page} copy={copy} />;
  }
}

function OverviewBarsSlide({ page, copy }: { page: ReportPage; copy: PageCopy }) {
  const target = firstNumber(page.metrics[2]?.value || "");
  const invert = page.id === "complaints";
  return (
    <main className="ppt-body overview-layout">
      <section className="ppt-overview-copy">
        <SummarySentence page={page} />
      </section>
      <section className="ppt-chart-card large">
        <h2>{page.chartTitle.replace("各公司", "")}</h2>
        <VerticalBarChart rows={page.companies} previousLabel="2025年" currentLabel="2026年" target={target} invertDelta={invert} />
      </section>
      <InsightList page={page} copy={copy} />
    </main>
  );
}

function SplitTwoChartsSlide({ page, copy }: { page: ReportPage; copy: PageCopy }) {
  const leftRows = page.companies;
  const rightRows = page.secondaryCompanies || [];
  return (
    <main className="ppt-body split-layout">
      <section className="ppt-split-grid">
        <div className="ppt-chart-card">
          <h2>{page.data?.splitLeftTitle || "自建项目"}</h2>
          <VerticalBarChart rows={leftRows} previousLabel="2025年" currentLabel="2026年" compact />
        </div>
        <div className="ppt-chart-card">
          <h2>{page.data?.splitRightTitle || "外拓项目"}</h2>
          <VerticalBarChart rows={rightRows} previousLabel="2025年" currentLabel="2026年" compact />
        </div>
      </section>
      <InsightList page={page} copy={copy} compact />
    </main>
  );
}

function ClearanceSlide({ page, copy }: { page: ReportPage; copy: PageCopy }) {
  const rows = page.data?.clearanceRows || [];
  return (
    <main className="ppt-body clearance-layout">
      <section className="clearance-grid">
        <table className="ppt-table clearance-table">
          <thead>
            <tr>
              <th>公司</th>
              <th>基础指标</th>
              <th>实收金额</th>
              <th>基础指标完成率</th>
              <th>自建完成率</th>
              <th>外拓完成率</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 16).map((row) => (
              <tr key={row.company}>
                <td>{row.company}</td>
                <td>{numberText(row.selfTarget)}</td>
                <td>{numberText(row.selfCollected)}</td>
                <td>{pct(row.selfRate)}</td>
                <td>{pct(row.selfRate)}</td>
                <td>{pct(row.externalRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="clearance-bars">
          <TitledRatePanel title="基础指标完成率" rows={page.companies} valueKey="current" />
          <TitledRatePanel title="外拓完成率" rows={page.companies} valueKey="secondary" />
        </div>
      </section>
      <InsightList page={page} copy={copy} compact />
    </main>
  );
}

function TitledRatePanel({
  title,
  rows,
  valueKey
}: {
  title: string;
  rows: CompanyMetric[];
  valueKey: keyof CompanyMetric;
}) {
  return (
    <div className="rate-panel">
      <h2>{title}</h2>
      <HorizontalRateList rows={rows} valueKey={valueKey} limit={13} />
    </div>
  );
}

function SpaceSlide({ page, copy }: { page: ReportPage; copy: PageCopy }) {
  const rows = page.data?.spaceRows || [];
  const totalTarget = rows.reduce((sum, row) => sum + (row.target || 0), 0);
  const totalBooked = rows.reduce((sum, row) => sum + (row.booked || 0), 0);
  const totalForecast = rows.reduce((sum, row) => sum + (row.forecast || 0), 0);
  const completeCount = rows.filter((row) => (row.forecast || 0) >= (row.target || Infinity)).length;
  return (
    <main className="ppt-body space-layout">
      <section className="space-headline">
        <strong>{Math.round(totalBooked)}</strong>
        <span>万元已入账，全年预估 {Math.round(totalForecast)} 万元</span>
        <em>{completeCount} 家公司预计完成孰高指标</em>
      </section>
      <section className="space-year-strip">
        <SpaceYearItem label="25年完成" value={Math.round(rows.reduce((sum, row) => sum + (row.lastYear || 0), 0))} />
        <SpaceYearItem label="26年预算" value={Math.round(rows.reduce((sum, row) => sum + (row.budget || 0), 0))} />
        <SpaceYearItem label="孰高指标" value={Math.round(totalTarget)} active />
        <SpaceYearItem label="预计完成" value={Math.round(totalForecast)} active />
      </section>
      <section className="space-single-panel">
        <SpaceStackedChart title="空间资源指标完成情况" rows={rows} single />
      </section>
      <InsightList page={page} copy={copy} compact />
    </main>
  );
}

function SpaceYearItem({ label, value, active = false }: { label: string; value: number; active?: boolean }) {
  return (
    <div className={active ? "space-year-item active" : "space-year-item"}>
      <span>{label}</span>
      <strong>{numberText(value)}</strong>
    </div>
  );
}

function SpaceStackedChart({
  title,
  rows,
  emphasized = false,
  single = false
}: {
  title: string;
  rows: SpaceResourceRow[];
  emphasized?: boolean;
  single?: boolean;
}) {
  return (
    <div className={`${emphasized ? "space-stack-card emphasized" : "space-stack-card"}${single ? " single" : ""}`}>
      <h3>{title}</h3>
      <div className="space-axis">
        {[0, 20, 40, 60, 80, 100].map((tick) => <span key={tick}>{tick}%</span>)}
      </div>
      <div className="space-stack-list">
        {rows.map((row) => {
          const target = row.target || 1;
          const booked = clampPercent(((row.booked || 0) / target) * 100);
          const pending = clampPercent(((row.pendingBooked || 0) / target) * 100);
          const renewal = clampPercent(((row.pendingRenewal || 0) / target) * 100);
          const gap = Math.max(0, 100 - booked - pending - renewal);
          return (
            <div className="space-stack-row" key={row.company}>
              <span>{row.company}</span>
              <div className="space-stack-track">
                <b className="booked" style={{ width: `${booked}%` }}>{booked > 12 ? numberText(row.booked, 1) : ""}</b>
                <b className="pending" style={{ width: `${pending}%` }}>{pending > 12 ? numberText(row.pendingBooked, 1) : ""}</b>
                <b className="renewal" style={{ width: `${renewal}%` }}>{renewal > 12 ? numberText(row.pendingRenewal, 1) : ""}</b>
                <b className="gap" style={{ width: `${gap}%` }} />
              </div>
              <em className={(row.gap || 0) >= 0 ? "tone-green" : "tone-red"}>{numberText(row.gap, 1)}</em>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChargingSlide({ page, copy }: { page: ReportPage; copy: PageCopy }) {
  return (
    <main className="ppt-body charging-layout">
      <KpiStrip metrics={page.metrics} />
      <section className="charging-grid">
        <div className="quadrant-panel">
          <h2>充电桩经营分析</h2>
          <Quadrant rows={page.companies} xLabel="用电水平" yLabel="流量收入" />
        </div>
        <div className="charging-side">
          <div className="ppt-chart-card slim">
            <h2>充电桩收入情况-整体</h2>
            <HorizontalRateList rows={page.companies} valueKey="delta" compareKey="delta" limit={12} />
          </div>
          <MetricTable rows={page.companies} columns={["综合利润", "自营端口", "联营端口"]} />
        </div>
      </section>
      <InsightList page={page} copy={copy} compact />
    </main>
  );
}

function RepairSlide({ page, copy }: { page: ReportPage; copy: PageCopy }) {
  return (
    <main className="ppt-body repair-layout">
      <section className="repair-grid">
        <div className="ppt-chart-card">
          <h2>入户维修满意度</h2>
          <HorizontalRateList rows={page.companies} valueKey="current" compareKey="delta" limit={14} />
        </div>
        <div className="quadrant-panel">
          <h2>满意度 · 及时响应率 分析</h2>
          <Quadrant rows={page.companies} xLabel="及时响应率" yLabel="满意度" />
        </div>
      </section>
      <InsightList page={page} copy={copy} compact />
    </main>
  );
}

function ComplaintsSlide({ page, copy }: { page: ReportPage; copy: PageCopy }) {
  return (
    <main className="ppt-body complaints-layout">
      <section className="complaint-grid">
        <div className="complaint-panel">
          <h2>投诉率</h2>
          <HorizontalRateList rows={page.companies} valueKey="current" compareKey="delta" invertDelta limit={14} />
        </div>
        <div className="complaint-panel">
          <h2>投诉处理满意度</h2>
          <HorizontalRateList rows={page.companies} valueKey="secondary" compareKey="target" limit={14} />
        </div>
      </section>
      <MetricTable rows={page.companies} columns={["投诉率", "同比", "投诉处理满意度", "同比"]} complaints />
      <InsightList page={page} copy={copy} compact />
    </main>
  );
}

function KpiStrip({ metrics }: { metrics: ReportPage["metrics"] }) {
  return (
    <section className="kpi-strip">
      {metrics.map((metric) => (
        <div key={metric.label}>
          <span>{metric.label}</span>
          <strong className={`tone-${metric.tone || "blue"}`}>{metric.value}</strong>
          {metric.sublabel ? <em className={metric.sublabel.includes("-") ? "tone-red" : "tone-green"}>{metric.sublabel}</em> : null}
        </div>
      ))}
    </section>
  );
}

function MetricTable({ rows, columns, complaints = false }: { rows: CompanyMetric[]; columns: string[]; complaints?: boolean }) {
  return (
    <table className="ppt-table metric-table">
      <thead>
        <tr>
          <th>公司</th>
          {columns.map((column, index) => <th key={`${column}-${index}`}>{column}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 10).map((row) => (
          <tr key={row.company}>
            <td>{row.company}</td>
            {complaints ? (
              <>
                <td>{pct(row.current)}</td>
                <td className={deltaClass(row.delta, true)}>{pp(row.delta)}</td>
                <td>{pct(row.secondary)}</td>
                <td className={deltaClass(row.target)}>{pp(row.target)}</td>
              </>
            ) : (
              <>
                <td>{pct(row.current)}</td>
                <td>{pct(row.secondary)}</td>
                <td>{pct(row.target)}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Quadrant({ rows, xLabel, yLabel }: { rows: CompanyMetric[]; xLabel: string; yLabel: string }) {
  const usable = rows.filter((row) => row.current != null && (row.secondary ?? row.target) != null);
  const xValues = usable.map((row) => row.secondary ?? row.target ?? 0);
  const yValues = usable.map((row) => row.current ?? 0);
  const xMin = Math.min(...xValues) - 5;
  const xMax = Math.max(...xValues) + 5;
  const yMin = Math.min(...yValues) - 5;
  const yMax = Math.max(...yValues) + 5;
  const xAvg = xValues.reduce((sum, value) => sum + value, 0) / Math.max(xValues.length, 1);
  const yAvg = yValues.reduce((sum, value) => sum + value, 0) / Math.max(yValues.length, 1);
  const sx = (value: number) => 90 + ((value - xMin) / Math.max(xMax - xMin, 1)) * 700;
  const sy = (value: number) => 430 - ((value - yMin) / Math.max(yMax - yMin, 1)) * 330;

  return (
    <svg className="ppt-quadrant" viewBox="0 0 860 500" role="img" aria-label={`${yLabel}与${xLabel}象限图`}>
      <rect x="70" y="70" width="720" height="360" fill="#eef7f1" />
      <rect x="430" y="70" width="360" height="180" fill="#e8f2fb" />
      <rect x="70" y="250" width="360" height="180" fill="#f7dfdf" />
      <rect x="430" y="250" width="360" height="180" fill="#fff6d9" />
      <line x1={sx(xAvg)} y1="70" x2={sx(xAvg)} y2="430" stroke="#7d8792" strokeDasharray="6 6" />
      <line x1="70" y1={sy(yAvg)} x2="790" y2={sy(yAvg)} stroke="#7d8792" strokeDasharray="6 6" />
      <text x="92" y="96" className="quad-label">业务良好</text>
      <text x="610" y="96" className="quad-label">金牌标杆</text>
      <text x="95" y="408" className="quad-label danger">重点关注</text>
      <text x="610" y="408" className="quad-label warn">质量提升</text>
      <text x="390" y="480" className="axis-name">{xLabel}</text>
      <text x="20" y="260" className="axis-name rotate">{yLabel}</text>
      {usable.map((row, index) => {
        const xValue = row.secondary ?? row.target ?? 0;
        const yValue = row.current ?? 0;
        return (
          <g key={row.company}>
            <circle cx={sx(xValue)} cy={sy(yValue)} r="9" className={`dot dot-${index % 4}`} />
            <text x={sx(xValue) + 13} y={sy(yValue) + 5} className="dot-label">{row.company}</text>
          </g>
        );
      })}
    </svg>
  );
}
