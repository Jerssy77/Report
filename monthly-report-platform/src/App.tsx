import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  RefreshCw,
  Save,
  UploadCloud
} from "lucide-react";
import type { PageCopy, PageId, Report, ReportListItem } from "../shared/report";
import {
  bootstrapSample,
  exportSnapshot,
  getReport,
  listReports,
  regenerateCopy,
  saveCopy,
  uploadReport,
  assetUrl
} from "./api";
import { SlideCanvas } from "./components/SlideCanvas";

function queryParam(name: string) {
  return new URLSearchParams(window.location.search).get(name);
}

const blankCopy: PageCopy = {
  mainConclusion: "",
  keyCompanies: "",
  reason: "",
  note: "",
  history: []
};

function normalizePpText(value: string | undefined) {
  return (value || "").replace(/pp\b/g, "%");
}

function normalizeCopy(copy: PageCopy): PageCopy {
  return {
    ...copy,
    mainConclusion: normalizePpText(copy.mainConclusion),
    keyCompanies: normalizePpText(copy.keyCompanies),
    reason: normalizePpText(copy.reason),
    note: normalizePpText(copy.note)
  };
}

export default function App() {
  const exportMode = queryParam("export") === "1";
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<PageId>("current-overview");
  const [copyDraft, setCopyDraft] = useState<PageCopy>(blankCopy);
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(5);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<Record<string, File | null>>({
    analysis: null,
    brief: null,
    supplement: null,
    resident: null
  });

  const selectedPage = useMemo(
    () => report?.pages.find((page) => page.id === selectedPageId) || report?.pages[0],
    [report, selectedPageId]
  );

  useEffect(() => {
    void loadInitial();
  }, []);

  useEffect(() => {
    if (!report || !selectedPage) return;
    setCopyDraft(normalizeCopy(report.copy[selectedPage.id] || blankCopy));
  }, [report, selectedPage]);

  async function loadInitial() {
    try {
      setBusy("正在载入报告");
      const items = await listReports();
      setReports(items);
      const requestedPeriod = queryParam("period");
      const period = items.some((item) => item.period === requestedPeriod) ? requestedPeriod : items[0]?.period;
      if (period) {
        const loaded = await getReport(period);
        setReport(loaded);
        setYear(loaded.year);
        setMonth(loaded.month);
        syncPeriodUrl(loaded.period);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "载入失败");
    } finally {
      setBusy("");
    }
  }

  async function handleBootstrap() {
    try {
      setBusy("正在导入当前目录样例");
      const loaded = await bootstrapSample();
      setReport(loaded);
      setReports(await listReports());
      setYear(loaded.year);
      setMonth(loaded.month);
      syncPeriodUrl(loaded.period);
      setMessage("已导入当前 5 月样例数据和补充模板样例。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入失败");
    } finally {
      setBusy("");
    }
  }

  async function handleUpload() {
    try {
      setBusy("正在上传并解析 Excel");
      const formData = new FormData();
      formData.append("year", String(year));
      formData.append("month", String(month));
      for (const key of ["analysis", "brief", "supplement", "resident"]) {
        const file = files[key];
        if (file) formData.append(key, file);
      }
      const loaded = await uploadReport(formData);
      setReport(loaded);
      setReports(await listReports());
      setSelectedPageId("current-overview");
      syncPeriodUrl(loaded.period);
      setMessage("数据包已解析，人工文案已保留。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setBusy("");
    }
  }

  async function handleSaveCopy() {
    if (!report || !selectedPage) return;
    try {
      setBusy("正在保存文案");
      const loaded = await saveCopy(report.period, selectedPage.id, copyDraft);
      setReport(loaded);
      setMessage("文案已保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy("");
    }
  }

  async function handleRegenerate() {
    if (!report || !selectedPage) return;
    try {
      setBusy("正在重新生成草稿");
      const loaded = await regenerateCopy(report.period, selectedPage.id);
      setReport(loaded);
      setMessage("已按当前数据重新生成该页文案草稿。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成失败");
    } finally {
      setBusy("");
    }
  }

  async function handleExport() {
    if (!report) return;
    try {
      setBusy("正在截图导出 PDF 和 PPTX");
      const loaded = await exportSnapshot(report.period);
      setReport(loaded);
      setReports(await listReports());
      setMessage("导出完成，已生成新的版本。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导出失败");
    } finally {
      setBusy("");
    }
  }

  async function handlePickReport(period: string) {
    if (!period || period === report?.period) return;
    try {
      setBusy("正在切换报告月份");
      const loaded = await getReport(period);
      setReport(loaded);
      setYear(loaded.year);
      setMonth(loaded.month);
      setSelectedPageId("current-overview");
      syncPeriodUrl(loaded.period);
      setMessage(`已切换至 ${loaded.year} 年 ${loaded.month} 月。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "月份切换失败");
    } finally {
      setBusy("");
    }
  }

  if (exportMode) {
    if (!report) return <div className="export-loading">正在载入导出版面...</div>;
    return (
      <div className="export-deck">
        {report.pages.map((page) => (
          <SlideCanvas key={page.id} page={page} copy={report.copy[page.id]} updatedAt={report.updatedAt} exportMode />
        ))}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <img src={assetUrl("/brand-logo.png")} alt="世纪金源服务" />
          <div>
            <strong>月度运营驾驶舱</strong>
            <span>{report ? `${report.year}年${report.month}月经营月报` : "等待导入经营数据"}</span>
          </div>
        </div>
        <div className="header-status">
          <ReportPeriodPicker
            reports={reports}
            value={report?.period || ""}
            onPick={handlePickReport}
            disabled={Boolean(busy)}
          />
          <span>{busy || message || "报告阅读、图表复盘与导出"}</span>
          <div className="top-actions">
            <button className="ghost" onClick={loadInitial} disabled={Boolean(busy)}>
              <RefreshCw size={16} />
              刷新
            </button>
            <button className="primary" onClick={handleExport} disabled={!report || Boolean(busy)}>
              <Download size={16} />
              导出 PDF+PPTX
            </button>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        {report && selectedPage ? (
          <>
            <section className="report-hero">
              <div className="report-heading">
                <span className="overline">运营回顾</span>
                <h1>{selectedPage.subtitle}</h1>
                <p>{normalizePpText(copyDraft.mainConclusion || selectedPage.bullets[0])}</p>
              </div>
              <PageMetrics page={selectedPage} />
            </section>

            <PageTabs pages={report.pages} selectedPageId={selectedPage.id} onPick={setSelectedPageId} disabled={!report} />

            <section className="report-stage">
              <section className="preview-column">
                <div className="preview-toolbar">
                  <div>
                    <span>16:9 月报预览</span>
                    <strong>{selectedPage.order}. {selectedPage.chartTitle}</strong>
                  </div>
                  <ValidationStrip report={report} pageId={selectedPage.id} />
                </div>
                <div className="slide-preview-wrap">
                  <SlideCanvas page={selectedPage} copy={copyDraft} updatedAt={report.updatedAt} />
                </div>
                <SourceTrace report={report} pageId={selectedPage.id} />
              </section>

              <aside className="insight-panel">
                <section className="insight-card">
                  <div className="panel-title">
                    <ClipboardList size={18} />
                    <span>本页经营结论</span>
                  </div>
                  <InsightLines copyDraft={copyDraft} selectedPage={selectedPage} />
                </section>

                <details className="utility-panel" open>
                  <summary>
                    <History size={18} />
                    文案微调
                  </summary>
                  <CopyEditor
                    copyDraft={copyDraft}
                    setCopyDraft={setCopyDraft}
                    onRegenerate={handleRegenerate}
                    onSave={handleSaveCopy}
                    busy={Boolean(busy)}
                  />
                </details>

                <details className="utility-panel">
                  <summary>
                    <FileText size={18} />
                    导出版本
                  </summary>
                  <ExportList report={report} />
                </details>
              </aside>
            </section>
          </>
        ) : (
          <section className="empty-dashboard">
            <div>
              <FileSpreadsheet size={48} />
              <span className="overline">运营月报</span>
              <h1>先导入一个报告数据包</h1>
              <p>载入当前 5 月样例，或上传新的数据分析、经营简报和补充数据 Excel 后生成 9 页经营月报。</p>
              <button className="primary" onClick={handleBootstrap} disabled={Boolean(busy)}>
                载入当前 5 月样例
              </button>
            </div>
          </section>
        )}

        <section className="utility-dock">
          <details className="utility-panel compact" open={!report}>
            <summary>
              <UploadCloud size={18} />
              数据包
            </summary>
            <UploadPanel
              year={year}
              month={month}
              setYear={setYear}
              setMonth={setMonth}
              setFiles={setFiles}
              handleUpload={handleUpload}
              handleBootstrap={handleBootstrap}
              busy={Boolean(busy)}
            />
          </details>

          <details className="utility-panel compact" open={!report}>
            <summary>
              <Database size={18} />
              报告版本
            </summary>
            <ReportVersions
              reports={reports}
              report={report}
              onPick={handlePickReport}
            />
          </details>
        </section>
      </main>
    </div>
  );
}

function syncPeriodUrl(period: string) {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("period", period);
  window.history.replaceState(null, "", nextUrl);
}

function ReportPeriodPicker({
  reports,
  value,
  onPick,
  disabled
}: {
  reports: ReportListItem[];
  value: string;
  onPick: (period: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="report-period-picker">
      <CalendarDays size={18} />
      <span>查看月份</span>
      <select value={value} onChange={(event) => onPick(event.target.value)} disabled={disabled || !reports.length}>
        {!reports.length ? <option value="">暂无报告</option> : null}
        {reports.map((item) => (
          <option key={item.period} value={item.period}>
            {item.year}年{item.month}月
          </option>
        ))}
      </select>
    </label>
  );
}

function PageMetrics({ page }: { page: Report["pages"][number] }) {
  return (
    <div className="metric-ribbon">
      {page.metrics.map((metric) => (
        <div className="metric-card" key={metric.label}>
          <span>{metric.label}</span>
          <strong className={`tone-${metric.tone || "blue"}`}>{metric.value.replace(/pp\b/g, "%")}</strong>
          {metric.sublabel ? <em>{metric.sublabel.replace(/pp\b/g, "%")}</em> : null}
        </div>
      ))}
    </div>
  );
}

function PageTabs({
  pages,
  selectedPageId,
  onPick,
  disabled
}: {
  pages: Report["pages"];
  selectedPageId: PageId;
  onPick: (pageId: PageId) => void;
  disabled: boolean;
}) {
  const currentIndex = Math.max(0, pages.findIndex((page) => page.id === selectedPageId));
  return (
    <div className="page-tabs-wrap">
      <nav className="page-tabs" aria-label={"\u6708\u62a5\u9875\u9762"}>
        {pages.map((page, index) => (
          <button
            key={page.id}
            className={selectedPageId === page.id ? "page-tab active" : "page-tab"}
            onClick={() => onPick(page.id)}
            disabled={disabled}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {page.subtitle}
          </button>
        ))}
      </nav>
      <div className="page-count">
        {"\u5171"} {pages.length} {"\u9875"} · {"\u5f53\u524d\u7b2c"} {currentIndex + 1} {"\u9875"}
      </div>
    </div>
  );
}
function InsightLines({
  copyDraft,
  selectedPage
}: {
  copyDraft: PageCopy;
  selectedPage: Report["pages"][number];
}) {
  const lines = [
    normalizePpText(copyDraft.mainConclusion || selectedPage.bullets[0]),
    normalizePpText(copyDraft.keyCompanies),
    normalizePpText(copyDraft.reason || selectedPage.bullets[1])
  ].filter(Boolean);
  return (
    <ol className="dashboard-insights">
      {lines.slice(0, 3).map((line, index) => (
        <li key={`${index}-${line}`}>{line}</li>
      ))}
    </ol>
  );
}

function UploadPanel({
  year,
  month,
  setYear,
  setMonth,
  setFiles,
  handleUpload,
  handleBootstrap,
  busy
}: {
  year: number;
  month: number;
  setYear: (year: number) => void;
  setMonth: (month: number) => void;
  setFiles: Dispatch<SetStateAction<Record<string, File | null>>>;
  handleUpload: () => void;
  handleBootstrap: () => void;
  busy: boolean;
}) {
  return (
    <div className="upload-panel">
      <div className="period-row">
        <label>
          <span>年份</span>
          <input value={year} onChange={(event) => setYear(Number(event.target.value))} type="number" />
        </label>
        <label>
          <span>月份</span>
          <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((item) => (
              <option key={item} value={item}>
                {item}月
              </option>
            ))}
          </select>
        </label>
      </div>
      <FileInput label="数据分析" name="analysis" onPick={(file) => setFiles((prev) => ({ ...prev, analysis: file }))} />
      <FileInput label="经营简报" name="brief" onPick={(file) => setFiles((prev) => ({ ...prev, brief: file }))} />
      <FileInput label="补充数据" name="supplement" onPick={(file) => setFiles((prev) => ({ ...prev, supplement: file }))} />
      <FileInput label="常驻户数" name="resident" onPick={(file) => setFiles((prev) => ({ ...prev, resident: file }))} />
      <div className="panel-actions">
        <button className="primary" onClick={handleUpload} disabled={busy}>
          上传并解析
        </button>
        <button className="ghost" onClick={handleBootstrap} disabled={busy}>
          载入样例
        </button>
      </div>
      <a className="template-link" href={assetUrl("/api/templates/supplement.xlsx")}>
        下载补充数据模板
      </a>
    </div>
  );
}

function ReportVersions({
  reports,
  report,
  onPick
}: {
  reports: ReportListItem[];
  report: Report | null;
  onPick: (period: string) => void;
}) {
  return (
    <div className="report-list">
      {reports.length ? (
        reports.map((item) => (
          <button
            key={item.period}
            className={item.period === report?.period ? "report-item active" : "report-item"}
            onClick={() => onPick(item.period)}
          >
            <span>
              <CalendarDays size={15} />
              {item.year}年{item.month}月
            </span>
            <em>{item.validationErrors ? `${item.validationErrors} 个错误` : `${item.exports} 个导出`}</em>
          </button>
        ))
      ) : (
        <p className="muted">还没有报告，先载入样例或上传 Excel。</p>
      )}
    </div>
  );
}

function CopyEditor({
  copyDraft,
  setCopyDraft,
  onRegenerate,
  onSave,
  busy
}: {
  copyDraft: PageCopy;
  setCopyDraft: (copyDraft: PageCopy) => void;
  onRegenerate: () => void;
  onSave: () => void;
  busy: boolean;
}) {
  return (
    <div className="copy-editor">
      <label>
        主结论
        <textarea
          value={copyDraft.mainConclusion}
          onChange={(event) => setCopyDraft({ ...copyDraft, mainConclusion: event.target.value })}
          rows={3}
        />
      </label>
      <label>
        重点公司
        <textarea
          value={copyDraft.keyCompanies}
          onChange={(event) => setCopyDraft({ ...copyDraft, keyCompanies: event.target.value })}
          rows={2}
        />
      </label>
      <label>
        原因说明
        <textarea
          value={copyDraft.reason}
          onChange={(event) => setCopyDraft({ ...copyDraft, reason: event.target.value })}
          rows={3}
        />
      </label>
      <label>
        补充备注
        <textarea
          value={copyDraft.note}
          onChange={(event) => setCopyDraft({ ...copyDraft, note: event.target.value })}
          rows={2}
        />
      </label>
      <div className="editor-actions">
        <button className="ghost" onClick={onRegenerate} disabled={busy}>
          <RefreshCw size={16} />
          重新生成
        </button>
        <button className="primary" onClick={onSave} disabled={busy}>
          <Save size={16} />
          保存
        </button>
      </div>
    </div>
  );
}

function FileInput({ label, name, onPick }: { label: string; name: string; onPick: (file: File | null) => void }) {
  return (
    <label className="file-input">
      <span>{label}</span>
      <input name={name} type="file" accept=".xlsx" onChange={(event) => onPick(event.target.files?.[0] || null)} />
    </label>
  );
}

function ValidationStrip({ report, pageId }: { report: Report; pageId: PageId }) {
  const issues = report.validation.filter((issue) => !issue.pageId || issue.pageId === pageId);
  if (!issues.length) {
    return (
      <div className="validation ok">
        <CheckCircle2 size={15} />
        校验通过
      </div>
    );
  }
  return (
    <div className="validation warn">
      <AlertCircle size={15} />
      {issues.filter((issue) => issue.severity === "error").length} 错误 / {issues.length} 提示
    </div>
  );
}

function SourceTrace({ report, pageId }: { report: Report; pageId: PageId }) {
  const traces = report.sources.filter((source) => source.pageId === pageId);
  return (
    <div className="source-trace">
      {traces.map((source) => (
        <span key={source.id}>
          来源：{source.fileName} / {source.sheet} / {source.range}
        </span>
      ))}
    </div>
  );
}

function ExportList({ report }: { report: Report }) {
  const latest = report.exports[0];
  return (
    <div className="export-card">
      <strong>导出版本</strong>
      {latest ? (
        <>
          <span>{latest.id}</span>
          <div className="export-links">
            <a href={assetUrl(`/api/reports/${report.period}/exports/${latest.id}/pdf`)}>下载 PDF</a>
            <a href={assetUrl(`/api/reports/${report.period}/exports/${latest.id}/pptx`)}>下载 PPTX</a>
          </div>
        </>
      ) : (
        <p>还没有导出。导出前会检查关键数据是否完整。</p>
      )}
    </div>
  );
}
