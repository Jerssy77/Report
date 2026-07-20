import type { ClearanceRow, CompanyMetric, EnergyCostRow, EquipmentHealthRow, PageCopy, ReportPage, SatisfactionScoreRow, SpaceResourceRow } from "../../shared/report";
import type { CSSProperties } from "react";
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

function displayText(value: string | undefined) {
  return (value || "").replace(/pp\b/g, "%");
}

function average(rows: CompanyMetric[], key: keyof CompanyMetric) {
  const values = rows
    .map((row) => row[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sortedBy(rows: CompanyMetric[], key: keyof CompanyMetric, direction: "asc" | "desc" = "desc") {
  return [...rows].sort((left, right) => {
    const delta = Number(right[key] ?? 0) - Number(left[key] ?? 0);
    return direction === "desc" ? delta : -delta;
  });
}

function numeric(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numericMetric(row: CompanyMetric, key: keyof CompanyMetric) {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function scoreText(value: number | null | undefined, digits = 1) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}分`;
}

function plainNumber(value: number | null | undefined, digits = 1) {
  if (value == null || Number.isNaN(value)) return "—";
  return numberText(value, digits);
}

function riskClass(row: CompanyMetric, target?: number | null, invertDelta = false) {
  const missesTarget = target != null && numeric(row.current) < target;
  const weakDelta = row.delta != null && (invertDelta ? row.delta > 0 : row.delta < 0);
  if (missesTarget && weakDelta) return "risk";
  if (missesTarget || weakDelta) return "watch";
  return "steady";
}

function declineBottomCompanies<T extends { company: string }>(
  rows: T[],
  rankValue: (row: T) => number | null | undefined,
  deltaValue: (row: T) => number | null | undefined = (row) => (row as T & { delta?: number | null }).delta
) {
  const ranked = [...rows].sort((left, right) => numeric(rankValue(right)) - numeric(rankValue(left)));
  return new Set(ranked.slice(-3).filter((row) => numeric(deltaValue(row)) < 0).map((row) => row.company));
}

function declineBottomClass(company: string, set: Set<string>) {
  return set.has(company) ? "decline-bottom" : "";
}

type ChartValueFormat = "pct" | "score" | "number";

function chartValueText(value: number | null | undefined, format: ChartValueFormat = "pct") {
  if (format === "score") return scoreText(value);
  if (format === "number") return plainNumber(value);
  return pct(value);
}

function InsightList({ copy, page, compact = false }: { copy: PageCopy; page: ReportPage; compact?: boolean }) {
  const lines = [copy.mainConclusion || page.bullets[0], copy.reason || page.bullets[1]].filter(Boolean);
  return (
    <section className={compact ? "ppt-insights compact" : "ppt-insights"}>
      {lines.slice(0, 2).map((line, index) => (
        <div className="ppt-insight" key={index}>
          <span>{index + 1}</span>
          <p>{displayText(line)}</p>
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
  const chartRows = sortedBy(rows, "current");
  const averageValue = average(chartRows, "current");
  const numericValues = chartRows
    .flatMap((row) => [row.previous, row.current])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const scaleFloor = compact ? 40 : 100;
  const highest = Math.max(scaleFloor, target || 0, averageValue || 0, ...numericValues);
  const max = Math.min(MAX_BAR, Math.ceil(highest / 20) * 20);
  const ticks = Array.from({ length: Math.floor(max / 20) + 1 }, (_, index) => max - index * 20);
  const averageTop = undefined;
  const targetTop = undefined;
  const declineSet = declineBottomCompanies(chartRows, (row) => row.current, (row) => row.delta);

  return (
    <div className={compact ? "ppt-bars compact visual-bars" : "ppt-bars visual-bars"}>
      <div className="ppt-chart-legend">
        <span><i className="legend-prev" />{previousLabel}</span>
        <span><i className="legend-current" />{currentLabel}</span>
        {averageValue != null ? <span><i className="legend-average" />均值 {pct(averageValue)}</span> : null}
        {target != null ? <span><i className="legend-target" />目标 {pct(target)}</span> : null}
      </div>
      <div className="ppt-bar-plot">
        <div className="ppt-y-axis">
          {ticks.map((tick) => <span key={tick} style={{ top: `${100 - (tick / max) * 100}%` }}>{tick}%</span>)}
        </div>
        <div className="ppt-grid">
          {ticks.map((tick) => <span key={tick} style={{ top: `${100 - (tick / max) * 100}%` }} />)}
          {averageTop ? <em className="average-line" style={{ top: averageTop }} /> : null}
          {targetTop ? <em className="target-line" style={{ top: targetTop }} /> : null}
        </div>
        <div className="ppt-bar-groups" style={{ gridTemplateColumns: `repeat(${chartRows.length}, minmax(0, 1fr))` }}>
          {chartRows.map((row, index) => (
            <div className={`ppt-bar-group ${riskClass(row, target, invertDelta)} ${index < 3 ? "leader" : ""} ${declineBottomClass(row.company, declineSet)}`} key={row.company}>
              <div className="ppt-bar-pair">
                <b className="prev" style={{ height: `${(clampPercent(row.previous, max) / max) * 100}%` }} />
                <b className="current" style={{ height: `${(clampPercent(row.current, max) / max) * 100}%` }} />
              </div>
              <strong>{row.company}</strong>
              <div className="ppt-bar-bottom">
                <span>{pct(row.current)}</span>
                <em className={deltaClass(row.delta, invertDelta)}>{pp(row.delta)}</em>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RankCompareChart({
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
  const chartRows = sortedBy(rows, "current");
  const averageValue = average(chartRows, "current");
  const numericValues = chartRows
    .flatMap((row) => [row.previous, row.current])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const scaleFloor = compact ? 40 : 100;
  const highest = Math.max(scaleFloor, target || 0, averageValue || 0, ...numericValues);
  const max = Math.min(MAX_BAR, Math.ceil(highest / 20) * 20);
  const ticks = Array.from({ length: Math.floor(max / 20) + 1 }, (_, index) => max - index * 20);
  const averageTop = averageValue == null ? undefined : `${100 - (clampPercent(averageValue, max) / max) * 100}%`;
  const targetTop = target == null ? undefined : `${100 - (clampPercent(target, max) / max) * 100}%`;
  const columns = [chartRows];
  const declineSet = declineBottomCompanies(chartRows, (row) => row.current, (row) => row.delta);
  return (
    <div className={compact ? "rank-compare-chart compact" : "rank-compare-chart"}>
      <div className="chart-meta-row">
        <div className="axis-ticks">
          {ticks.map((tick) => <span key={tick} style={{ left: `${tick / max * 100}%` }}>{tick}%</span>)}
        </div>
        <span><i className="legend-prev" />{previousLabel}</span>
        <span><i className="legend-current" />{currentLabel}</span>
        {averageValue != null ? <span><i className="legend-average" />均值 {pct(averageValue)}</span> : null}
        {target != null ? <span><i className="legend-target" />目标 {pct(target)}</span> : null}
      </div>
      <div className={compact ? "rank-columns single" : "rank-columns"}>
        {columns.map((column, columnIndex) => (
          <div className="rank-column" key={columnIndex}>
            {column.map((row, index) => {
              const currentWidth = clampPercent(row.current, max) / max * 100;
              const previousWidth = clampPercent(row.previous, max) / max * 100;
              const avgLeft = averageValue == null ? undefined : `${clampPercent(averageValue, max) / max * 100}%`;
              const targetLeft = target == null ? undefined : `${clampPercent(target, max) / max * 100}%`;
              return (
                <div className={`rank-row ${riskClass(row, target, invertDelta)} ${declineBottomClass(row.company, declineSet)}`} key={row.company}>
                  <span className="rank-index">{columnIndex * column.length + index + 1}</span>
                  <strong>{row.company}</strong>
                  <div className="rank-track">
                    <i className="rank-grid" />
                    {avgLeft ? <i className="rank-reference average" style={{ left: avgLeft }} /> : null}
                    {targetLeft ? <i className="rank-reference target" style={{ left: targetLeft }} /> : null}
                    {row.previous != null ? <b className="rank-previous" style={{ width: `${previousWidth}%` }} /> : null}
                    <b className="rank-current" style={{ width: `${currentWidth}%` }} />
                  </div>
                  <span className="rank-value">{pct(row.current)}</span>
                  <em className={deltaClass(row.delta, invertDelta)}>{pp(row.delta)}</em>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function SplitRankTable({
  rows,
  title
}: {
  rows: CompanyMetric[];
  title: string;
}) {
  return (
    <div className="split-rank-card">
      <h2>{title}</h2>
      <VerticalBarChart rows={rows} previousLabel="2025" currentLabel="2026" compact />
    </div>
  );
}

function HorizontalRateList({
  rows,
  valueKey = "current",
  compareKey,
  invertDelta = false,
  limit = 13,
  valueFormat = "pct"
}: {
  rows: CompanyMetric[];
  valueKey?: keyof CompanyMetric;
  compareKey?: keyof CompanyMetric;
  invertDelta?: boolean;
  limit?: number;
  valueFormat?: ChartValueFormat;
}) {
  const sorted = sortedBy(rows, valueKey).slice(0, limit);
  const signed = sorted.some((row) => Number(row[valueKey] ?? 0) < 0);
  const signedMax = Math.max(1, ...sorted.map((row) => Math.abs(Number(row[valueKey] ?? 0))));
  const declineSet = declineBottomCompanies(sorted, (row) => numericMetric(row, valueKey), (row) => row.delta);
  return (
    <div className="ppt-rate-list">
      {sorted.map((row) => {
        const rawValue = row[valueKey] as number | null | undefined;
        const value = typeof rawValue === "number" ? rawValue : null;
        const compare = compareKey ? row[compareKey] as number | null | undefined : undefined;
        const maxValue = valueFormat === "score" ? 10 : 100;
        const width = signed ? Math.min(Math.abs(numeric(value)) / signedMax * 100, 100) : (clampPercent(value, maxValue) / maxValue) * 100;
        return (
          <div className={`ppt-rate-row${compareKey ? "" : " no-compare"} ${declineBottomClass(row.company, declineSet)}`} key={row.company}>
            <span>{row.company}</span>
            <div className={numeric(value) < 0 ? "ppt-rate-track negative" : "ppt-rate-track"}>
              <b style={{ width: `${width}%` }} />
            </div>
            <strong>{chartValueText(value, valueFormat)}</strong>
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
          <strong className={`tone-${metric.tone || "blue"}`}>{displayText(metric.value)}</strong>
          {metric.sublabel ? <em>{displayText(metric.sublabel)}</em> : null}
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
    case "equipment-health":
      return <EquipmentHealthSlide page={page} copy={copy} />;
    case "energy-cost":
      return <EnergyCostSlide page={page} copy={copy} />;
    case "charging-dashboard":
      return <ChargingSlide page={page} copy={copy} />;
    case "repair-dashboard":
      return <RepairSlide page={page} copy={copy} />;
    case "complaints-dashboard":
      return <ComplaintsSlide page={page} copy={copy} />;
    case "efficiency-dashboard":
      return <EfficiencySlide page={page} copy={copy} />;
    default:
      return <OverviewBarsSlide page={page} copy={copy} />;
  }
}

function OverviewBarsSlide({ page, copy }: { page: ReportPage; copy: PageCopy }) {
  const targetMetric = page.metrics.find((metric) => metric.label.includes("目标"));
  const target = targetMetric ? firstNumber(targetMetric.value || "") : null;
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
      <HorizontalRateList rows={rows} valueKey={valueKey} />
    </div>
  );
}

function ClearanceOperatingSlide({ page, copy }: { page: ReportPage; copy: PageCopy }) {
  const rows = [...(page.data?.clearanceRows || [])].sort((left, right) => numeric(right.selfRate) - numeric(left.selfRate));
  const averageSelfRate = rows.length ? rows.reduce((sum, row) => sum + numeric(row.selfRate), 0) / rows.length : 0;
  const averageExternalRate = rows.length ? rows.reduce((sum, row) => sum + numeric(row.externalRate), 0) / rows.length : 0;
  const pressureCount = rows.filter((row) => numeric(row.selfRate) < 30).length;
  return (
    <main className="ppt-body clearance-layout">
      <section className="clearance-operating-panel">
        <div className="clearance-summary-strip">
          <div>
            <span>基础平均完成率</span>
            <strong>{pct(averageSelfRate)}</strong>
          </div>
          <div>
            <span>外拓平均完成率</span>
            <strong>{pct(averageExternalRate)}</strong>
          </div>
          <div>
            <span>承压公司</span>
            <strong className={pressureCount ? "tone-red" : "tone-green"}>{pressureCount} 家</strong>
          </div>
        </div>
        <table className="ppt-table clearance-table clearance-operating-table">
          <thead>
            <tr>
              <th>公司</th>
              <th>基础指标</th>
              <th>实收金额</th>
              <th>基础指标完成率</th>
              <th>外拓完成率</th>
              <th>完成状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 16).map((row) => {
              const selfRate = numeric(row.selfRate);
              const externalRate = numeric(row.externalRate);
              const status = selfRate >= 50 ? "领先" : selfRate >= 30 ? "跟进" : "承压";
              const statusTone = selfRate >= 50 ? "leading" : selfRate >= 30 ? "tracking" : "pressure";
              return (
                <tr key={row.company}>
                  <td>{row.company}</td>
                  <td>{numberText(row.selfTarget)}</td>
                  <td>{numberText(row.selfCollected)}</td>
                  <td><InlineRateBar value={selfRate} /></td>
                  <td><InlineRateBar value={externalRate} /></td>
                  <td><span className={`status-pill status-${statusTone}`}>{status}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <InsightList page={page} copy={copy} compact />
    </main>
  );
}

function InlineRateBar({ value }: { value: number }) {
  return (
    <div className="inline-rate-bar">
      <span style={{ width: `${clampPercent(value, 100)}%` }} />
      <strong>{pct(value)}</strong>
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
      <section className="space-summary-band">
        <div className="space-summary-primary">
          <span>26年已入账</span>
          <strong>{numberText(Math.round(totalBooked))}万</strong>
          <em>全年预计 {numberText(Math.round(totalForecast))} 万 · {completeCount} 家公司预计达标</em>
        </div>
        <div className="space-year-strip">
          <SpaceYearItem label="25年完成" value={Math.round(rows.reduce((sum, row) => sum + (row.lastYear || 0), 0))} />
          <SpaceYearItem label="26年预算" value={Math.round(rows.reduce((sum, row) => sum + (row.budget || 0), 0))} />
          <SpaceYearItem label="孰高指标" value={Math.round(totalTarget)} active />
          <SpaceYearItem label="预计完成" value={Math.round(totalForecast)} active />
        </div>
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
  const gapPercent = (row: SpaceResourceRow) => {
    const target = numeric(row.target);
    if (!target) return 0;
    return ((target - numeric(row.forecast)) / target) * 100;
  };
  const sortedRows = [...rows].sort((left, right) => gapPercent(left) - gapPercent(right));
  return (
    <div className={`${emphasized ? "space-stack-card emphasized" : "space-stack-card"}${single ? " single" : ""}`}>
      <div className="space-chart-head">
        <h3>{title}</h3>
        <div className="space-legend">
          <span><i className="booked" />已入账</span>
          <span><i className="pending" />已签待入账</span>
          <span><i className="renewal" />续约待确认</span>
          <span><i className="gap" />缺口</span>
        </div>
      </div>
      <div className="space-axis">
        {[0, 20, 40, 60, 80, 100].map((tick) => <span key={tick}>{tick}%</span>)}
      </div>
      <div className="space-stack-list">
        {sortedRows.map((row) => {
          const target = row.target || 1;
          const booked = clampPercent(((row.booked || 0) / target) * 100);
          const pending = clampPercent(((row.pendingBooked || 0) / target) * 100);
          const renewal = clampPercent(((row.pendingRenewal || 0) / target) * 100);
          const gap = Math.max(0, 100 - booked - pending - renewal);
          const pressure = numeric(row.gap) < 0 ? "gap-risk" : "gap-good";
          return (
            <div className={`space-stack-row ${pressure}`} key={row.company}>
              <span>{row.company}</span>
              <div className="space-stack-track">
                <b className="booked" style={{ width: `${booked}%` }}>{booked > 12 ? numberText(row.booked, 1) : ""}</b>
                <b className="pending" style={{ width: `${pending}%` }}>{pending > 12 ? numberText(row.pendingBooked, 1) : ""}</b>
                <b className="renewal" style={{ width: `${renewal}%` }}>{renewal > 12 ? numberText(row.pendingRenewal, 1) : ""}</b>
                <b className="gap" style={{ width: `${gap}%` }} />
              </div>
              <strong>{pct(((row.forecast || 0) / target) * 100)}</strong>
              <em className={(row.gap || 0) >= 0 ? "tone-green" : "tone-red"}>{numberText(row.gap, 1)}</em>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EquipmentHealthSlide({ page, copy }: { page: ReportPage; copy: PageCopy }) {
  const rows = page.data?.equipmentRows || [];
  const usesElevatorFault = rows.some((row) => row.elevatorFaultRate != null);
  return (
    <main className="ppt-body score-layout equipment-layout">
      <KpiStrip metrics={page.metrics} />
      <section className="equipment-visual-layout">
        <div className="score-panel equipment-rank-panel">
          <h2>公司健康度排名</h2>
          <EquipmentScoreChart rows={rows} />
        </div>
        <div className="score-panel equipment-defect-panel">
          <h2>扣分构成（距100分差额）</h2>
          <EquipmentDefectChart rows={rows} usesElevatorFault={usesElevatorFault} />
        </div>
      </section>
      <InsightList page={page} copy={copy} compact />
    </main>
  );
}

function EquipmentScoreChart({ rows }: { rows: EquipmentHealthRow[] }) {
  const sorted = [...rows].sort((left, right) => numeric(right.score) - numeric(left.score));
  const values = sorted.map((row) => numeric(row.score));
  const averageScore = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const max = Math.max(100, ...values);
  const averageLeft = averageScore == null ? undefined : `${clampPercent(averageScore, max) / max * 100}%`;
  return (
    <div className="equipment-score-chart">
      <div className="equipment-score-head">
        <span>公司</span>
        <strong>{averageScore == null ? "集团均值 —" : `集团均值 ${scoreText(averageScore)}`}</strong>
      </div>
      <div className="equipment-score-axis">
        {[0, 20, 40, 60, 80, 100].map((tick) => <span key={tick}>{tick}</span>)}
      </div>
      <div className="equipment-score-list">
        {sorted.map((row) => {
          const value = numeric(row.score);
          return (
            <div className="equipment-score-row" key={row.company}>
              <span>{row.company}</span>
              <div className="equipment-score-track">
                {averageLeft ? <i style={{ left: averageLeft }} /> : null}
                <b style={{ width: `${clampPercent(value, max) / max * 100}%` }} />
              </div>
              <strong>{plainNumber(row.score)}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EquipmentDefectChart({ rows, usesElevatorFault }: { rows: EquipmentHealthRow[]; usesElevatorFault: boolean }) {
  const defectRows = rows.map((row) => {
    const inspection = Math.max(0, 100 - numeric(row.inspectionRate)) * 0.3;
    const maintenance = Math.max(0, 100 - numeric(row.maintenanceRate)) * 0.3;
    const elevator = Math.max(0, 100 - numeric(usesElevatorFault ? row.elevatorFaultRate : row.onsiteFactor)) * 0.4;
    const total = inspection + maintenance + elevator;
    return { row, inspection, maintenance, elevator, total };
  }).sort((left, right) => left.total - right.total);
  const max = Math.max(1, Math.ceil(Math.max(...defectRows.map((item) => item.total)) / 5) * 5);
  return (
    <div className="equipment-defect-chart">
      <div className="equipment-defect-head">
        <span>公司</span>
        <span>总扣分（分）</span>
        <strong><i className="blue" />巡检扣分</strong>
        <strong><i className="red" />维保扣分</strong>
        <strong><i className="green" />{usesElevatorFault ? "电梯扣分" : "巡查扣分"}</strong>
      </div>
      <div className="equipment-defect-list">
        {defectRows.map((item) => (
          <div className="equipment-defect-row" key={item.row.company}>
            <span>{item.row.company}</span>
            <strong>{plainNumber(item.total)}</strong>
            <div className="equipment-defect-track">
              <b className="inspection" style={{ width: `${item.inspection / max * 100}%` }}>{item.inspection >= 1 ? plainNumber(item.inspection) : ""}</b>
              <b className="maintenance" style={{ width: `${item.maintenance / max * 100}%` }}>{item.maintenance >= 1 ? plainNumber(item.maintenance) : ""}</b>
              <b className="elevator" style={{ width: `${item.elevator / max * 100}%` }}>{item.elevator >= 0.6 ? plainNumber(item.elevator) : ""}</b>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EquipmentCompositionChart({ rows, usesElevatorFault }: { rows: EquipmentHealthRow[]; usesElevatorFault: boolean }) {
  const avgMetric = (selector: (row: EquipmentHealthRow) => number | null | undefined) => {
    const values = rows.map(selector).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const metrics = [
    { label: "巡检完成率", weight: 30, value: avgMetric((row) => row.inspectionRate), tone: "blue" },
    { label: "维保完成率", weight: 30, value: avgMetric((row) => row.maintenanceRate), tone: "red" },
    { label: usesElevatorFault ? "电梯故障率" : "现场巡查系数", weight: 40, value: avgMetric((row) => usesElevatorFault ? row.elevatorFaultRate : row.onsiteFactor), tone: "green" }
  ];
  const score = avgMetric((row) => row.score);
  return (
    <div className="health-composition">
      <div className="health-score-block">
        <span>综合健康度</span>
        <strong>{scoreText(score)}</strong>
        <em>100分基准线</em>
      </div>
      <div className="health-weighted-bar">
        {metrics.map((metric) => {
          const contribution = metric.value == null ? 0 : metric.value * metric.weight / 100;
          return (
            <b
              className={`health-segment ${metric.tone}`}
              key={metric.label}
              style={{ width: `${clampPercent(contribution, 100)}%` }}
              title={`${metric.label} ${pct(metric.value)}`}
            />
          );
        })}
        <i style={{ left: "100%" }} />
      </div>
      <div className="health-driver-list">
        {metrics.map((metric) => {
          const gap = metric.value == null ? null : Math.max(0, 100 - metric.value);
          return (
            <div className={`health-driver ${metric.tone}`} key={metric.label}>
              <span>{metric.label}<em>权重 {metric.weight}%</em></span>
              <div className="health-driver-track">
                <b style={{ width: `${clampPercent(metric.value, 100)}%` }} />
                <i />
              </div>
              <strong>{pct(metric.value)}</strong>
              <small>缺口 {pct(gap)}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EquipmentHealthSummary({ rows, usesElevatorFault }: { rows: EquipmentHealthRow[]; usesElevatorFault: boolean }) {
  const avgMetric = (selector: (row: EquipmentHealthRow) => number | null | undefined) => {
    const values = rows.map(selector).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const cards = [
    { label: "巡检完成率", value: avgMetric((row) => row.inspectionRate), tone: "blue", note: "现场巡检执行" },
    { label: "维保完成率", value: avgMetric((row) => row.maintenanceRate), tone: "red", note: "当前主要短板" },
    { label: usesElevatorFault ? "电梯故障率" : "现场巡查系数", value: avgMetric((row) => usesElevatorFault ? row.elevatorFaultRate : row.onsiteFactor), tone: "green", note: usesElevatorFault ? "设备运行稳定性" : "现场管理质量" }
  ];
  return (
    <div className="equipment-summary-strip">
      {cards.map((card) => {
        const gap = card.value == null ? null : Math.max(0, 100 - card.value);
        return (
          <div className={`equipment-summary-card ${card.tone}`} key={card.label}>
            <span>{card.label}</span>
            <strong>{pct(card.value)}</strong>
            <div className="equipment-summary-track">
              <b style={{ width: `${clampPercent(card.value, 100)}%` }} />
              <i />
            </div>
            <em>{card.note}</em>
            <small>距100分基准 {pct(gap)}</small>
          </div>
        );
      })}
    </div>
  );
}

function EnergyCostSlide({ page, copy }: { page: ReportPage; copy: PageCopy }) {
  const rows = page.data?.energyRows || [];
  return (
    <main className="ppt-body score-layout energy-layout">
      <KpiStrip metrics={page.metrics} />
      <section className="energy-cost-layout">
        <div className="score-panel">
          <h2>26年合计成本排名</h2>
          <CostRankChart rows={rows} />
        </div>
        <div className="score-panel">
          <h2>合计成本同比升幅排名</h2>
          <CostYoYChart rows={rows} />
        </div>
        <EnergyCostSummary rows={rows} />
      </section>
      <InsightList page={page} copy={copy} compact />
    </main>
  );
}

function EnergyCostSummary({ rows }: { rows: EnergyCostRow[] }) {
  const costRows = rows.filter((row) => (row.totalCost26 ?? row.cost) != null);
  const yoyRows = rows.filter((row) => (row.costYoY ?? row.delta) != null);
  const topCost = [...costRows].sort((left, right) => numeric(right.totalCost26 ?? right.cost) - numeric(left.totalCost26 ?? left.cost))[0];
  const topRise = [...yoyRows].sort((left, right) => numeric(right.costYoY ?? right.delta) - numeric(left.costYoY ?? left.delta))[0];
  const waterTotal = rows.reduce((sum, row) => sum + numeric(row.waterCost26), 0);
  const electricityTotal = rows.reduce((sum, row) => sum + numeric(row.electricityCost26), 0);
  const utilityTotal = waterTotal + electricityTotal;
  const waterShare = utilityTotal ? waterTotal / utilityTotal * 100 : null;
  const cards = [
    {
      label: "高成本关注",
      value: topCost ? topCost.company : "--",
      sub: topCost ? `26年合计 ${plainNumber(topCost.totalCost26 ?? topCost.cost, 0)}` : "成本录入后显示最高公司",
      tone: "blue"
    },
    {
      label: "升幅关注",
      value: topRise ? topRise.company : "--",
      sub: topRise ? `同比 ${pp(topRise.costYoY ?? topRise.delta)}` : "同比录入后显示升幅最高公司",
      tone: "red"
    },
    {
      label: "水电拆分",
      value: waterShare == null ? "--" : `${pct(waterShare)} / ${pct(100 - waterShare)}`,
      sub: waterShare == null ? "水费、电费录入后显示结构" : "水费 / 电费占比",
      tone: "green"
    }
  ];
  return (
    <div className="energy-summary-strip">
      {cards.map((card) => (
        <div className={`energy-summary-card ${card.tone}`} key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
          <em>{card.sub}</em>
        </div>
      ))}
    </div>
  );
}

function CostRankChart({ rows }: { rows: EnergyCostRow[] }) {
  const totalCost = (row: EnergyCostRow) => row.totalCost26 ?? row.cost ?? (
    row.waterCost26 != null || row.electricityCost26 != null ? numeric(row.waterCost26) + numeric(row.electricityCost26) : null
  );
  const sorted = [...rows].sort((left, right) => numeric(totalCost(right)) - numeric(totalCost(left)));
  const hasValues = sorted.some((row) => totalCost(row) != null);
  const max = hasValues ? Math.max(1, ...sorted.map((row) => numeric(totalCost(row)))) : 1000;
  const ticks = [0, max / 2, max];
  const declineSet = declineBottomCompanies(sorted, (row) => totalCost(row), (row) => row.costYoY ?? row.delta);
  return (
    <div className="cost-chart cost-stack-chart">
      <div className="cost-chart-legend">
        <span><i className="current" />电费（万元）</span>
        <span><i className="prev" />水费（万元）</span>
        <strong>合计成本（万元）</strong>
      </div>
      <div className="cost-axis">
        {ticks.map((tick) => <span key={tick}>{tick ? plainNumber(tick, 0) : "0"}</span>)}
      </div>
      <div className={hasValues ? "cost-chart-plot stack" : "cost-chart-plot stack muted"}>
        {sorted.map((row) => {
          const total = totalCost(row);
          const electricity = row.electricityCost26 ?? (total != null && row.waterCost26 == null ? total : null);
          const water = row.waterCost26;
          const electricityWidth = numeric(electricity) / max * 100;
          const waterWidth = numeric(water) / max * 100;
          return (
            <div className={`cost-chart-row ${declineBottomClass(row.company, declineSet)}`} key={row.company}>
              <span>{row.company}</span>
              <div className="cost-chart-track">
                {electricity != null ? <b className="electricity" style={{ width: `${electricityWidth}%` }}>{electricityWidth > 10 ? plainNumber(electricity, 0) : ""}</b> : null}
                {water != null ? <i className="water" style={{ width: `${waterWidth}%` }}>{waterWidth > 8 ? plainNumber(water, 0) : ""}</i> : null}
              </div>
              <strong>{plainNumber(total, 0)}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CostYoYChart({ rows }: { rows: EnergyCostRow[] }) {
  const sorted = [...rows].sort((left, right) => numeric(left.costYoY ?? left.delta) - numeric(right.costYoY ?? right.delta));
  const hasValues = sorted.some((row) => (row.costYoY ?? row.delta) != null);
  const max = Math.max(15, ...sorted.map((row) => Math.abs(numeric(row.costYoY ?? row.delta))));
  const declineSet = declineBottomCompanies(sorted, (row) => row.costYoY ?? row.delta, (row) => row.costYoY ?? row.delta);
  return (
    <div className="cost-chart yoy">
      <div className="cost-yoy-axis">
        <span>同比下降</span>
        <strong>0%</strong>
        <span>同比上升</span>
      </div>
      <div className="cost-chart-plot">
        {sorted.map((row) => {
          const value = row.costYoY ?? row.delta;
          const width = value == null ? 0 : Math.abs(value) / max * 50;
          return (
            <div className={`${numeric(value) > 0 ? "cost-yoy-row rising" : "cost-yoy-row falling"} ${!hasValues ? "muted" : ""} ${declineBottomClass(row.company, declineSet)}`} key={row.company}>
              <span>{row.company}</span>
              <div className="cost-yoy-track">
                {value != null ? <b style={numeric(value) >= 0 ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }} /> : null}
              </div>
              <strong className={deltaClass(value, true)}>{pp(value)}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScoreRankList({ rows, limit = 14, valueLabel = "得分 / 权重" }: { rows: CompanyMetric[]; limit?: number; valueLabel?: string }) {
  const sorted = sortedBy(rows, "current").slice(0, limit);
  const max = Math.max(120, ...sorted.map((row) => numeric(row.current)));
  const benchmarkLeft = `${clampPercent(100, max) / max * 100}%`;
  return (
    <div className="score-rank-list">
      <div className="score-rank-head">
        <span>公司</span>
        <strong>100分基准线</strong>
        <em>{valueLabel}</em>
      </div>
      {sorted.map((row) => {
        const value = numeric(row.current);
        const width = `${clampPercent(value, max) / max * 100}%`;
        return (
          <div className={value < 100 ? "score-rank-row risk" : "score-rank-row"} key={row.company}>
            <span>{row.company}</span>
            <div className="score-rank-track">
              <i style={{ left: benchmarkLeft }} />
              <b style={{ width }} />
            </div>
            <strong>{scoreText(row.current)}{row.secondary != null ? <em>{scoreText(row.secondary)}</em> : null}</strong>
          </div>
        );
      })}
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
            <HorizontalRateList rows={page.companies} valueKey="delta" compareKey="delta" limit={13} />
          </div>
          <MetricTable rows={page.companies} columns={["综合利润", "自营端口", "联营端口"]} />
        </div>
      </section>
      <InsightList page={page} copy={copy} compact />
    </main>
  );
}

function RepairSlide({ page, copy }: { page: ReportPage; copy: PageCopy }) {
  const satisfactionRows = page.data?.satisfactionRows || [];
  return (
    <main className="ppt-body repair-layout">
      <section className="repair-grid satisfaction-single">
        <div className="ppt-chart-card">
          <h2>入户维修满意度分值与评分结构</h2>
          <SatisfactionMixChart rows={satisfactionRows} />
        </div>
      </section>
      <InsightList page={page} copy={copy} compact />
    </main>
  );
}

function DivergingDeltaList({ rows }: { rows: CompanyMetric[] }) {
  const sortedRows = [...rows].sort((left, right) => Math.abs(numeric(right.delta)) - Math.abs(numeric(left.delta)));
  const max = Math.max(1, ...sortedRows.map((row) => Math.abs(numeric(row.delta))));
  return (
    <div className="diverging-list">
      <div className="diverging-axis">
        <span>同比下降</span>
        <strong>0%</strong>
        <span>同比增长</span>
      </div>
      {sortedRows.map((row) => {
        const value = numeric(row.delta);
        const width = Math.abs(value) / max * 50;
        return (
          <div className={value >= 0 ? "diverging-row positive" : "diverging-row negative"} key={row.company}>
            <span>{row.company}</span>
            <div className="diverging-track">
              <b style={value >= 0 ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }} />
            </div>
            <strong className={deltaClass(value)}>{pp(value)}</strong>
          </div>
        );
      })}
    </div>
  );
}

function FocusRateRange({
  rows,
  compareKey
}: {
  rows: CompanyMetric[];
  compareKey: keyof CompanyMetric;
}) {
  const sortedRows = sortedBy(rows, "current");
  const values = sortedRows.map((row) => numeric(row.current));
  const min = Math.max(0, Math.floor((Math.min(...values) - 1) * 10) / 10);
  const max = Math.min(100, Math.ceil((Math.max(...values) + 0.5) * 10) / 10);
  const span = Math.max(max - min, 1);
  return (
    <div className="focus-rate-list">
      <div className="focus-axis">
        <span>{pct(min)}</span>
        <span>{pct((min + max) / 2)}</span>
        <span>{pct(max)}</span>
      </div>
      {sortedRows.map((row) => {
        const value = numeric(row.current);
        const left = (value - min) / span * 100;
        const compare = numericMetric(row, compareKey);
        return (
          <div className="focus-rate-row" key={row.company}>
            <span>{row.company}</span>
            <div className="focus-rate-track">
              <b style={{ left: `${clampPercent(left, 100)}%` }} />
            </div>
            <strong>{pct(value)}</strong>
            <em className={deltaClass(compare)}>{pp(compare)}</em>
          </div>
        );
      })}
    </div>
  );
}

function SatisfactionMixChart({ rows }: { rows: SatisfactionScoreRow[] }) {
  const sorted = [...rows].sort((left, right) => numeric(right.score) - numeric(left.score)).slice(0, 13);
  const bottomSet = new Set(sorted.slice(-3).map((row) => row.company));
  return (
    <div className="satisfaction-mix-chart">
      <div className="satisfaction-mix-head">
        <span>公司</span>
        <strong>满意度分值</strong>
        <strong>1-6分 / 7-10分</strong>
        <strong>满意度</strong>
      </div>
      {sorted.map((row) => {
        const low = numeric(row.lowShare);
        const high = numeric(row.highShare);
        const total = Math.max(low + high, 1);
        const scoreWidth = `${clampPercent(row.score, 10) / 10 * 100}%`;
        return (
          <div className={`satisfaction-mix-row ${bottomSet.has(row.company) ? "decline-bottom" : ""}`} key={row.company}>
            <span>{row.company}</span>
            <div className="satisfaction-score-track">
              <b style={{ width: scoreWidth }} />
            </div>
            <div className="satisfaction-mix-track">
              <b className="low" style={{ width: `${low / total * 100}%` }}>{low > 9 ? pct(low) : ""}</b>
              <b className="high" style={{ width: `${high / total * 100}%` }}>{high > 12 ? pct(high) : ""}</b>
            </div>
            <em>{scoreText(row.score)}</em>
          </div>
        );
      })}
    </div>
  );
}

function ComplaintsSlide({ page, copy }: { page: ReportPage; copy: PageCopy }) {
  const rows = sortedBy(page.companies, "current");
  const complaintAverage = average(page.companies, "current") ?? 0;
  const complaintDeltaAverage = average(page.companies, "delta") ?? 0;
  const satisfactionAverage = average(page.companies, "secondary") ?? 0;
  const complaintMax = Math.max(5, Math.ceil(Math.max(...rows.map((row) => Number(row.current || 0)), complaintAverage)));
  const satisfactionBottomSet = new Set([...rows].sort((left, right) => numeric(left.secondary) - numeric(right.secondary)).slice(0, 3).map((row) => row.company));
  const satisfactionRows = page.data?.satisfactionRows || [];
  const tableRows = [
    ...rows,
    {
      company: "集团",
      current: complaintAverage,
      delta: complaintDeltaAverage,
      secondary: satisfactionAverage
    }
  ];
  return (
    <main className="ppt-body complaints-layout ppt-complaints-reference">
      <section className="complaints-dashboard-grid">
        <div className="complaint-table-panel compact">
          <div className="complaint-benchmarks">
            <span><i className="complaint-dash group" />{pct(complaintAverage)} 集团投诉率均值</span>
          </div>
          <div className="complaint-table rate-only">
            <div className="complaint-row complaint-head">
              <strong>公司</strong>
              <strong>投诉率</strong>
              <strong>同比</strong>
              <strong>满意度</strong>
            </div>
            {tableRows.map((row) => {
              const isTotal = row.company === "集团";
              const satisfactionRisk = !isTotal && satisfactionBottomSet.has(row.company);
              return (
                <div className={isTotal ? "complaint-row total" : "complaint-row"} key={row.company}>
                  <span className={satisfactionRisk ? "complaint-company risk" : "complaint-company"}>{row.company}</span>
                  <ComplaintBarCell value={row.current} benchmark={complaintAverage} max={complaintMax} />
                  <em className={deltaClass(row.delta, true)}>{pp(row.delta)}</em>
                  <strong className="complaint-score-value">{scoreText(row.secondary)}</strong>
                </div>
              );
            })}
          </div>
        </div>
        <div className="ppt-chart-card">
          <h2>投诉满意度分值与评分结构</h2>
          <SatisfactionMixChart rows={satisfactionRows} />
        </div>
      </section>
      <ComplaintInsightList page={page} copy={copy} />
    </main>
  );
}

function EfficiencySlide({ page, copy }: { page: ReportPage; copy: PageCopy }) {
  return (
    <main className="ppt-body efficiency-layout">
      <KpiStrip metrics={page.metrics} />
      <section className="efficiency-chart-grid">
        <div className="ppt-chart-card">
          <h2>基础信息维护合格率（自建）</h2>
          <VerticalBarChart rows={page.companies} previousLabel="1月" currentLabel="5月" target={95} compact />
        </div>
        <div className="ppt-chart-card">
          <h2>400知晓率（自建）</h2>
          <VerticalBarChart rows={page.secondaryCompanies || []} previousLabel="1月" currentLabel="5月" target={50} compact />
        </div>
      </section>
      <InsightList page={page} copy={copy} compact />
    </main>
  );
}

function ComplaintBarCell({
  value,
  benchmark,
  max,
  tone = "group",
  format = "pct"
}: {
  value: number | null | undefined;
  benchmark: number;
  max: number;
  tone?: "group" | "industry";
  format?: ChartValueFormat;
}) {
  const safeMax = Math.max(max, 1);
  const width = `${clampPercent(Number(value || 0), safeMax) / safeMax * 100}%`;
  const markerLeft = `${clampPercent(benchmark, safeMax) / safeMax * 100}%`;
  return (
    <div className="complaint-bar-cell" style={{ "--bar-label-left": width } as CSSProperties}>
      <span className={`complaint-marker ${tone}`} style={{ left: markerLeft }} />
      <span className="complaint-bar" style={{ width }} />
      <strong>{chartValueText(value, format)}</strong>
    </div>
  );
}

function ComplaintInsightList({ page, copy }: { page: ReportPage; copy: PageCopy }) {
  const lines = [
    displayText(copy.mainConclusion || page.bullets[0]),
    displayText(copy.reason || page.bullets[1])
  ].filter(Boolean);
  return (
    <section className="complaint-insights">
      {lines.slice(0, 2).map((line, index) => (
        <p key={`${index}-${line}`}>
          <span>{index + 1}.</span>
          {line}
        </p>
      ))}
    </section>
  );
}

function KpiStrip({ metrics }: { metrics: ReportPage["metrics"] }) {
  return (
    <section className="kpi-strip">
      {metrics.map((metric) => (
        <div key={metric.label}>
          <span>{metric.label}</span>
          <strong className={`tone-${metric.tone || "blue"}`}>{displayText(metric.value)}</strong>
          {metric.sublabel ? <em className={metric.sublabel.includes("-") ? "tone-red" : "tone-green"}>{displayText(metric.sublabel)}</em> : null}
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
        {rows.slice(0, 13).map((row) => (
          <tr key={row.company}>
            <td>{row.company}</td>
            {complaints ? (
              <>
                <td>{pct(row.current)}</td>
                <td className={deltaClass(row.delta, true)}>{pp(row.delta)}</td>
                <td>{complaints ? scoreText(row.secondary) : pct(row.secondary)}</td>
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
  const missing = rows.filter((row) => row.current == null || (row.secondary ?? row.target) == null);
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
  const points = usable.map((row, index) => {
    const xValue = row.secondary ?? row.target ?? 0;
    const yValue = row.current ?? 0;
    const x = sx(xValue);
    const y = sy(yValue);
    const pointClass = yValue < yAvg && xValue < xAvg ? "risk" : yValue >= yAvg && xValue >= xAvg ? "leader" : "normal";
    return { row, index, x, y, pointClass };
  });
  const placedLabels: Array<{ x: number; y: number; w: number; h: number }> = [];
  const labelPositions = points.map((point) => {
    const labelWidth = Math.max(52, point.row.company.length * 20);
    const nearCenter = Math.abs(point.x - sx(xAvg)) < 90;
    const preferLeft = point.x > 690 || (nearCenter && point.index % 2 === 1);
    const baseX = preferLeft ? point.x - labelWidth - 18 : point.x + 18;
    const x = Math.max(84, Math.min(770 - labelWidth, baseX));
    const candidates = [8, -22, 38, -54, 68, -84, 98, -114].map((offset) => Math.max(84, Math.min(420, point.y + offset)));
    const y = candidates.find((candidateY) => {
      const box = { x, y: candidateY - 17, w: labelWidth, h: 24 };
      return !placedLabels.some((placed) => (
        box.x < placed.x + placed.w &&
        box.x + box.w > placed.x &&
        box.y < placed.y + placed.h &&
        box.y + box.h > placed.y
      ));
    }) ?? candidates[0];
    placedLabels.push({ x, y: y - 17, w: labelWidth, h: 24 });
    const leaderX = preferLeft ? x + labelWidth + 4 : x - 4;
    return { ...point, labelX: x, labelY: y, leaderX };
  });

  return (
    <svg className="ppt-quadrant" viewBox="0 0 860 500" role="img" aria-label={`${yLabel}与${xLabel}象限图`}>
      <rect x="70" y="70" width="720" height="360" fill="#f8fafc" />
      <rect x="70" y="70" width="360" height="180" fill="#edf7f3" />
      <rect x="430" y="70" width="360" height="180" fill="#eaf4fc" />
      <rect x="70" y="250" width="360" height="180" fill="#fbebe9" />
      <rect x="430" y="250" width="360" height="180" fill="#fff7df" />
      <line x1={sx(xAvg)} y1="70" x2={sx(xAvg)} y2="430" stroke="#7d8792" strokeDasharray="6 6" />
      <line x1="70" y1={sy(yAvg)} x2="790" y2={sy(yAvg)} stroke="#7d8792" strokeDasharray="6 6" />
      <text x={sx(xAvg) + 8} y="64" className="quad-average-label">均值线</text>
      <text x="794" y={sy(yAvg) - 8} className="quad-average-label">均值线</text>
      <text x="92" y="96" className="quad-label">业务良好</text>
      <text x="610" y="96" className="quad-label">金牌标杆</text>
      <text x="95" y="408" className="quad-label danger">重点关注</text>
      <text x="610" y="408" className="quad-label warn">质量提升</text>
      <text x="390" y="480" className="axis-name">{xLabel}</text>
      <text x="20" y="260" className="axis-name rotate">{yLabel}</text>
      {labelPositions.map(({ row, index, x, y, labelX, labelY, leaderX, pointClass }) => {
        return (
          <g className={`quad-point ${pointClass}`} key={row.company}>
            <circle cx={x} cy={y} r="9" className={`dot dot-${index % 4}`} />
            <line x1={x} y1={y} x2={leaderX} y2={labelY - 4} className="dot-leader" />
            <text x={labelX} y={labelY} className="dot-label">{row.company}</text>
          </g>
        );
      })}
      {missing.length ? (
        <g className="quad-missing">
          <rect x="604" y="112" width="168" height="92" rx="4" />
          <text x="620" y="136" className="quad-missing-title">待补充</text>
          {missing.slice(0, 6).map((row, index) => (
            <text x={620 + (index % 2) * 72} y={158 + Math.floor(index / 2) * 18} key={row.company}>{row.company}</text>
          ))}
        </g>
      ) : null}
    </svg>
  );
}
