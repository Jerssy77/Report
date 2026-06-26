import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import type { PageCopy, PageId, ReportFileKind } from "../shared/report.js";
import { DATA_ROOT, SERVER_PORT, SOURCE_ROOT, TEMPLATE_ROOT } from "./constants.js";
import { exportReport } from "./exporter.js";
import { buildReport, regenerateCopyForPage } from "./reportBuilder.js";
import { createSupplementWorkbookBuffer } from "./supplement.js";
import {
  copyFileIntoReport,
  ensureReportFolders,
  listReports,
  readReport,
  reportDir,
  sourceDir,
  writeReport
} from "./storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use("/files", express.static(DATA_ROOT));

const upload = multer({ dest: path.join(DATA_ROOT, "tmp", "uploads") });

function periodFromParts(year: unknown, month: unknown) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error("报告期无效，请选择年份和月份。");
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function sourceFilePath(period: string, kind: ReportFileKind, filename?: string) {
  return filename ? path.join(sourceDir(period), filename) : undefined;
}

async function existingFileMap(period: string) {
  const prior = await readReport(period);
  return {
    prior,
    files: {
      analysis: sourceFilePath(period, "analysis", prior?.files.analysis),
      brief: sourceFilePath(period, "brief", prior?.files.brief),
      supplement: sourceFilePath(period, "supplement", prior?.files.supplement)
    }
  };
}

async function saveUploaded(period: string, files: Partial<Record<ReportFileKind, Express.Multer.File[]>>) {
  await ensureReportFolders(period);
  const saved: Partial<Record<ReportFileKind, string>> = {};
  for (const kind of ["analysis", "brief", "supplement"] as ReportFileKind[]) {
    const file = files[kind]?.[0];
    if (!file) continue;
    const target = path.join(sourceDir(period), `${kind}.xlsx`);
    await fs.rename(file.path, target);
    saved[kind] = target;
  }
  return saved;
}

async function findWorkspaceSample(keyword: string) {
  const entries = await fs.readdir(SOURCE_ROOT);
  const found = entries.find((entry) => entry.endsWith(".xlsx") && entry.includes(keyword));
  return found ? path.join(SOURCE_ROOT, found) : undefined;
}

async function buildAndPersist(
  period: string,
  year: number,
  month: number,
  files: Partial<Record<ReportFileKind, string>>
) {
  const prior = await readReport(period);
  const report = buildReport({
    period,
    year,
    month,
    files,
    priorReport: prior
  });
  await writeReport(report);
  return report;
}

app.get("/api/reports", async (_req, res, next) => {
  try {
    res.json(await listReports());
  } catch (error) {
    next(error);
  }
});

app.get("/api/reports/:period", async (req, res, next) => {
  try {
    const report = await readReport(req.params.period);
    if (!report) return res.status(404).json({ message: "未找到报告。" });
    res.json(report);
  } catch (error) {
    next(error);
  }
});

app.post("/api/reports/bootstrap-sample", async (_req, res, next) => {
  try {
    const period = "2026-05";
    const year = 2026;
    const month = 5;
    const analysisSample = await findWorkspaceSample("数据分析");
    const briefSample = await findWorkspaceSample("经营简报");
    if (!analysisSample || !briefSample) {
      return res.status(400).json({ message: "当前目录未找到 5月数据分析 或 5月经营简报 Excel。" });
    }
    await ensureReportFolders(period);
    const analysis = await copyFileIntoReport(period, analysisSample, "analysis.xlsx");
    const brief = await copyFileIntoReport(period, briefSample, "brief.xlsx");
    const supplement = path.join(sourceDir(period), "supplement.xlsx");
    await fs.writeFile(supplement, createSupplementWorkbookBuffer());
    const report = await buildAndPersist(period, year, month, { analysis, brief, supplement });
    res.json(report);
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/reports",
  upload.fields([
    { name: "analysis", maxCount: 1 },
    { name: "brief", maxCount: 1 },
    { name: "supplement", maxCount: 1 }
  ]),
  async (req, res, next) => {
    try {
      const year = Number(req.body.year);
      const month = Number(req.body.month);
      const period = periodFromParts(year, month);
      const current = await existingFileMap(period);
      const uploaded = await saveUploaded(
        period,
        req.files as Partial<Record<ReportFileKind, Express.Multer.File[]>>
      );
      const report = await buildAndPersist(period, year, month, {
        ...current.files,
        ...uploaded
      });
      res.json(report);
    } catch (error) {
      next(error);
    }
  }
);

app.patch("/api/reports/:period/copy/:pageId", async (req, res, next) => {
  try {
    const report = await readReport(req.params.period);
    if (!report) return res.status(404).json({ message: "未找到报告。" });
    const pageId = req.params.pageId as PageId;
    if (!report.copy[pageId]) return res.status(404).json({ message: "未找到页面文案。" });
    const current = report.copy[pageId];
    const nextCopy: PageCopy = {
      ...current,
      ...req.body,
      updatedAt: new Date().toISOString(),
      history: [
        ...(current.history || []),
        {
          at: new Date().toISOString(),
          fields: {
            mainConclusion: current.mainConclusion,
            keyCompanies: current.keyCompanies,
            reason: current.reason,
            note: current.note,
            updatedAt: current.updatedAt
          }
        }
      ]
    };
    const next = {
      ...report,
      updatedAt: new Date().toISOString(),
      copy: { ...report.copy, [pageId]: nextCopy }
    };
    await writeReport(next);
    res.json(next);
  } catch (error) {
    next(error);
  }
});

app.post("/api/reports/:period/regenerate/:pageId", async (req, res, next) => {
  try {
    const report = await readReport(req.params.period);
    if (!report) return res.status(404).json({ message: "未找到报告。" });
    const next = regenerateCopyForPage(report, req.params.pageId as PageId);
    await writeReport(next);
    res.json(next);
  } catch (error) {
    next(error);
  }
});

app.post("/api/reports/:period/export", async (req, res, next) => {
  try {
    const report = await readReport(req.params.period);
    if (!report) return res.status(404).json({ message: "未找到报告。" });
    const next = await exportReport(report);
    res.json(next);
  } catch (error) {
    next(error);
  }
});

app.get("/api/reports/:period/exports/:exportId/:kind", async (req, res, next) => {
  try {
    const report = await readReport(req.params.period);
    if (!report) return res.status(404).json({ message: "未找到报告。" });
    const item = report.exports.find((entry) => entry.id === req.params.exportId);
    if (!item) return res.status(404).json({ message: "未找到导出版本。" });
    const file = req.params.kind === "pptx" ? item.pptxPath : item.pdfPath;
    res.download(file);
  } catch (error) {
    next(error);
  }
});

app.get("/api/templates/supplement.xlsx", async (_req, res, next) => {
  try {
    await fs.mkdir(TEMPLATE_ROOT, { recursive: true });
    const buffer = createSupplementWorkbookBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", encodeURIComponent("attachment; filename=补充数据模板.xlsx"));
    res.end(buffer);
  } catch (error) {
    next(error);
  }
});

const distDir = path.resolve(process.cwd(), "dist");
app.use(express.static(distDir));
app.get("*", async (_req, res, next) => {
  try {
    await fs.access(path.join(distDir, "index.html"));
    res.sendFile(path.join(distDir, "index.html"));
  } catch {
    next();
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "未知错误";
  console.error(error);
  res.status(500).json({ message });
});

await fs.mkdir(DATA_ROOT, { recursive: true });
await fs.mkdir(path.join(DATA_ROOT, "tmp", "uploads"), { recursive: true });

app.listen(SERVER_PORT, () => {
  console.log(`Monthly report server listening on http://127.0.0.1:${SERVER_PORT}`);
});
