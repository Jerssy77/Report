import type { CompanyMetric, ReportPage } from "../../shared/report";
import { pct, pp } from "../lib/format";

const blue = "#1976d2";
const lightBlue = "#a9cff7";
const red = "#e60012";
const green = "#00a85a";
const gray = "#7a8795";

function deltaColor(value: number | null | undefined, invert = false) {
  if (value == null || value === 0) return gray;
  const good = invert ? value < 0 : value > 0;
  return good ? green : red;
}

export function BarCompareChart({ page }: { page: ReportPage }) {
  const target = page.metrics[0]?.value.endsWith("%") ? Number(page.metrics[0].value.replace("%", "")) : undefined;
  const invert = page.id === "complaints";
  return (
    <BarComparison
      rows={page.companies}
      previousLabel="去年同期"
      currentLabel="本期"
      target={target}
      invertDelta={invert}
    />
  );
}

export function SplitBarsChart({ page }: { page: ReportPage }) {
  return (
    <BarComparison rows={page.companies} previousLabel="拆分项" currentLabel="主项" secondaryKey="secondary" />
  );
}

function BarComparison({
  rows,
  previousLabel,
  currentLabel,
  target,
  invertDelta = false,
  secondaryKey = "previous"
}: {
  rows: CompanyMetric[];
  previousLabel: string;
  currentLabel: string;
  target?: number;
  invertDelta?: boolean;
  secondaryKey?: "previous" | "secondary";
}) {
  const max = 120;
  const ticks = [120, 100, 80, 60, 40, 20, 0];
  const targetTop = target == null ? undefined : `${100 - Math.min(Math.max(target, 0), max) / max * 100}%`;
  return (
    <div className="chart-shell custom-bars">
      <div className="bar-legend">
        <span><i className="legend-prev" />{previousLabel}</span>
        <span><i className="legend-current" />{currentLabel}</span>
      </div>
      <div className="bar-plot">
        <div className="axis-labels">
          {ticks.map((tick) => (
            <span key={tick} style={{ top: `${100 - tick / max * 100}%` }}>{tick}%</span>
          ))}
        </div>
        <div className="grid-lines">
          {ticks.map((tick) => (
            <span key={tick} style={{ top: `${100 - tick / max * 100}%` }} />
          ))}
          {targetTop ? <em className="target-line" style={{ top: targetTop }} /> : null}
        </div>
        <div className="bar-groups" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
          {rows.map((row) => {
            const secondary = secondaryKey === "secondary" ? row.secondary : row.previous;
            return (
              <div className="bar-group" key={row.company}>
                <div className="bar-value-row">
                  <span>{pct(secondary)}</span>
                  <span>{pct(row.current)}</span>
                </div>
                <div className="bar-pair">
                  <b className="bar previous" style={{ height: `${Math.min(Number(secondary || 0), max) / max * 100}%` }} />
                  <b className="bar current" style={{ height: `${Math.min(Number(row.current || 0), max) / max * 100}%` }} />
                </div>
                <strong>{row.company}</strong>
                <em style={{ color: deltaColor(row.delta, invertDelta) }}>{pp(row.delta)}</em>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function HorizontalProgressChart({ page }: { page: ReportPage }) {
  const data = [...page.companies].sort((a, b) => Number(b.current || 0) - Number(a.current || 0));
  return (
    <div className="progress-list">
      {data.map((row) => (
        <div className="progress-row" key={row.company}>
          <div className="progress-company">{row.company}</div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${Math.min(Math.max(row.current || 0, 0), 110)}%` }}
            />
          </div>
          <div className="progress-value">{pct(row.current)}</div>
        </div>
      ))}
    </div>
  );
}

export function DualTableChart({ page }: { page: ReportPage }) {
  const data = page.companies.slice(0, 12);
  const invert = page.id === "complaints";
  return (
    <div className="dual-chart-grid">
      <div className="mini-bar-list">
        {data.map((row) => (
          <div className="mini-bar-row" key={row.company}>
            <span>{row.company}</span>
            <div className="mini-track">
              <div className="mini-fill" style={{ width: `${Math.min(Math.max(row.current || 0, 0), 100)}%` }} />
            </div>
            <strong>{pct(row.current)}</strong>
          </div>
        ))}
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>公司</th>
            <th>主指标</th>
            <th>同比</th>
            <th>辅助指标</th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 9).map((row) => (
            <tr key={row.company}>
              <td>{row.company}</td>
              <td>{pct(row.current)}</td>
              <td style={{ color: deltaColor(row.delta, invert) }}>{pp(row.delta)}</td>
              <td>{pct(row.secondary ?? row.target)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function QuadrantChart({ rows }: { rows: CompanyMetric[] }) {
  const xAvg = rows.reduce((sum, row) => sum + (row.current || 0), 0) / Math.max(rows.length, 1);
  const yAvg = rows.reduce((sum, row) => sum + (row.secondary || 0), 0) / Math.max(rows.length, 1);
  const minX = Math.min(...rows.map((row) => row.current || 0)) - 1;
  const maxX = Math.max(...rows.map((row) => row.current || 0)) + 1;
  const minY = Math.min(...rows.map((row) => row.secondary || 0)) - 5;
  const maxY = Math.max(...rows.map((row) => row.secondary || 0)) + 5;
  const scaleX = (value: number) => 80 + ((value - minX) / Math.max(maxX - minX, 1)) * 720;
  const scaleY = (value: number) => 460 - ((value - minY) / Math.max(maxY - minY, 1)) * 360;

  return (
    <div className="quadrant-wrap">
      <svg viewBox="0 0 880 520" role="img" aria-label="满意度响应及时率象限图">
        <rect x="60" y="60" width="780" height="420" fill="#f8fbff" stroke="#cbd9e8" />
        <rect x="60" y="60" width="390" height="210" fill="#edf7ef" />
        <rect x="450" y="60" width="390" height="210" fill="#eaf4fb" />
        <rect x="60" y="270" width="390" height="210" fill="#fff1f1" />
        <rect x="450" y="270" width="390" height="210" fill="#fff8df" />
        <line x1={scaleX(xAvg)} y1="60" x2={scaleX(xAvg)} y2="480" stroke="#5f7083" strokeDasharray="6 6" />
        <line x1="60" y1={scaleY(yAvg)} x2="840" y2={scaleY(yAvg)} stroke="#5f7083" strokeDasharray="6 6" />
        <text x="86" y="88" fill="#0a5b9a" fontSize="18" fontWeight="700">
          高满意 / 高时效
        </text>
        <text x="590" y="88" fill="#0a5b9a" fontSize="18" fontWeight="700">
          业务良性
        </text>
        <text x="88" y="456" fill="#a12727" fontSize="18" fontWeight="700">
          重点复盘
        </text>
        <text x="588" y="456" fill="#a66d00" fontSize="18" fontWeight="700">
          质量提升
        </text>
        {rows.map((row, index) => (
          <g key={row.company}>
            <circle
              cx={scaleX(row.current || 0)}
              cy={scaleY(row.secondary || 0)}
              r="8"
              fill={index % 3 === 0 ? blue : index % 3 === 1 ? green : "#ff9f1a"}
              stroke="#fff"
              strokeWidth="3"
            />
            <text x={scaleX(row.current || 0) + 12} y={scaleY(row.secondary || 0) + 5} fontSize="15" fill="#1e2d3d">
              {row.company}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function PageChart({ page }: { page: ReportPage }) {
  if (page.kind === "split-bars") return <SplitBarsChart page={page} />;
  if (page.kind === "clearance" || page.kind === "space") return <HorizontalProgressChart page={page} />;
  if (page.kind === "quadrant") return <QuadrantChart rows={page.companies} />;
  if (page.kind === "dual-table") return <DualTableChart page={page} />;
  return <BarCompareChart page={page} />;
}
