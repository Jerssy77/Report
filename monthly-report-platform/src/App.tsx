import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  RefreshCw,
  Save,
  UploadCloud
} from "lucide-react";
import type { PageCopy, PageId, Report, ReportListItem } from "../shared/report";
import { PAGE_ORDER } from "../shared/report";
import {
  bootstrapSample,
  exportSnapshot,
  getReport,
  listReports,
  regenerateCopy,
  saveCopy,
  uploadReport
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
    supplement: null
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
    setCopyDraft(report.copy[selectedPage.id] || blankCopy);
  }, [report, selectedPage]);

  async function loadInitial() {
    try {
      setBusy("正在载入报告");
      const items = await listReports();
      setReports(items);
      const period = queryParam("period") || items[0]?.period;
      if (period) {
        const loaded = await getReport(period);
        setReport(loaded);
        setYear(loaded.year);
        setMonth(loaded.month);
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
      for (const key of ["analysis", "brief", "supplement"]) {
        const file = files[key];
        if (file) formData.append(key, file);
      }
      const loaded = await uploadReport(formData);
      setReport(loaded);
      setReports(await listReports());
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
      <aside className="sidebar">
        <div className="app-title">
          <div className="app-mark">G</div>
          <div>
            <strong>月度运营数据展示平台</strong>
            <span>本地快照月报</span>
          </div>
        </div>

        <section className="side-section compact-upload">
          <div className="section-title">
            <UploadCloud size={16} />
            数据包
          </div>
          <div className="period-row">
            <input value={year} onChange={(event) => setYear(Number(event.target.value))} type="number" />
            <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((item) => (
                <option key={item} value={item}>
                  {item}月
                </option>
              ))}
            </select>
          </div>
          <FileInput label="数据分析" name="analysis" onPick={(file) => setFiles((prev) => ({ ...prev, analysis: file }))} />
          <FileInput label="经营简报" name="brief" onPick={(file) => setFiles((prev) => ({ ...prev, brief: file }))} />
          <FileInput label="补充数据" name="supplement" onPick={(file) => setFiles((prev) => ({ ...prev, supplement: file }))} />
          <button className="primary full" onClick={handleUpload} disabled={Boolean(busy)}>
            上传并解析
          </button>
          <button className="ghost full" onClick={handleBootstrap} disabled={Boolean(busy)}>
            载入当前5月样例
          </button>
          <a className="template-link" href="/api/templates/supplement.xlsx">
            下载补充数据模板
          </a>
        </section>

        <section className="side-section">
          <div className="section-title">
            <FileText size={16} />
            报告版本
          </div>
          <div className="report-list">
            {reports.length ? (
              reports.map((item) => (
                <button
                  key={item.period}
                  className={item.period === report?.period ? "report-item active" : "report-item"}
                  onClick={async () => {
                    setReport(await getReport(item.period));
                    setSelectedPageId("current-overview");
                  }}
                >
                  <span>{item.year}年{item.month}月</span>
                  <em>{item.validationErrors ? `${item.validationErrors} 个错误` : `${item.exports} 个导出`}</em>
                </button>
              ))
            ) : (
              <p className="muted">还没有报告，先载入样例或上传 Excel。</p>
            )}
          </div>
        </section>

        <section className="side-section page-nav">
          <div className="section-title">
            <FileSpreadsheet size={16} />
            版面
          </div>
          {PAGE_ORDER.map((page, index) => (
            <button
              key={page.id}
              className={selectedPageId === page.id ? "page-item active" : "page-item"}
              onClick={() => setSelectedPageId(page.id)}
              disabled={!report}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {page.title}
            </button>
          ))}
        </section>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <strong>{report ? `${report.year}年${report.month}月运营回顾` : "等待数据包"}</strong>
            <span>{busy || message || "上传固定模板 Excel 后生成 9 页快照月报"}</span>
          </div>
          <div className="top-actions">
            <button className="ghost" onClick={loadInitial} disabled={Boolean(busy)}>
              <RefreshCw size={16} />
              刷新
            </button>
            <button className="primary" onClick={handleExport} disabled={!report || Boolean(busy)}>
              <Download size={16} />
              导出PDF+PPTX
            </button>
          </div>
        </header>

        {report && selectedPage ? (
          <div className="work-grid">
            <section className="preview-column">
              <div className="preview-toolbar">
                <div>
                  <span>16:9 页面预览</span>
                  <strong>{selectedPage.order}. {selectedPage.subtitle}</strong>
                </div>
                <ValidationStrip report={report} pageId={selectedPage.id} />
              </div>
              <div className="slide-preview-wrap">
                <SlideCanvas page={selectedPage} copy={copyDraft} updatedAt={report.updatedAt} />
              </div>
              <SourceTrace report={report} pageId={selectedPage.id} />
            </section>

            <aside className="editor-panel">
              <div className="editor-head">
                <div>
                  <span>固定字段编辑</span>
                  <strong>{selectedPage.subtitle}</strong>
                </div>
                <History size={18} />
              </div>
              <label>
                主结论
                <textarea
                  value={copyDraft.mainConclusion}
                  onChange={(event) => setCopyDraft({ ...copyDraft, mainConclusion: event.target.value })}
                  rows={4}
                />
              </label>
              <label>
                重点公司
                <textarea
                  value={copyDraft.keyCompanies}
                  onChange={(event) => setCopyDraft({ ...copyDraft, keyCompanies: event.target.value })}
                  rows={3}
                />
              </label>
              <label>
                原因说明
                <textarea
                  value={copyDraft.reason}
                  onChange={(event) => setCopyDraft({ ...copyDraft, reason: event.target.value })}
                  rows={4}
                />
              </label>
              <label>
                补充备注
                <textarea
                  value={copyDraft.note}
                  onChange={(event) => setCopyDraft({ ...copyDraft, note: event.target.value })}
                  rows={3}
                />
              </label>
              <div className="editor-actions">
                <button className="ghost" onClick={handleRegenerate} disabled={Boolean(busy)}>
                  <RefreshCw size={16} />
                  重新生成草稿
                </button>
                <button className="primary" onClick={handleSaveCopy} disabled={Boolean(busy)}>
                  <Save size={16} />
                  保存
                </button>
              </div>
              <ExportList report={report} />
            </aside>
          </div>
        ) : (
          <div className="empty-state">
            <FileSpreadsheet size={42} />
            <h2>先导入一个报告数据包</h2>
            <p>可以直接载入当前目录的 5 月样例，也可以上传新的数据分析、经营简报和补充数据 Excel。</p>
            <button className="primary" onClick={handleBootstrap} disabled={Boolean(busy)}>
              载入当前5月样例
            </button>
          </div>
        )}
      </main>
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
  if (!issues.length) return <div className="validation ok">校验通过</div>;
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
            <a href={`/api/reports/${report.period}/exports/${latest.id}/pdf`}>下载 PDF</a>
            <a href={`/api/reports/${report.period}/exports/${latest.id}/pptx`}>下载 PPTX</a>
          </div>
        </>
      ) : (
        <p>还没有导出。导出前会检查关键数据是否完整。</p>
      )}
    </div>
  );
}
