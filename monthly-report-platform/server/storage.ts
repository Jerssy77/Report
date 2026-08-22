import fs from "node:fs/promises";
import path from "node:path";
import type { Report, ReportListItem } from "../shared/report.js";
import { REPORTS_ROOT } from "./constants.js";

const REMOVED_PAGE_IDS = new Set(["charging"]);
const REMOVED_VALIDATION_IDS = new Set(["missing-supplement", "empty-charging"]);

function normalizeReport(report: Report): Report {
  const pages = report.pages
    .filter((page) => !REMOVED_PAGE_IDS.has(String(page.id)))
    .map((page, index) => ({ ...page, order: index + 1 }));
  const copy = Object.fromEntries(
    Object.entries(report.copy || {}).filter(([pageId]) => !REMOVED_PAGE_IDS.has(pageId))
  ) as Report["copy"];
  return {
    ...report,
    pages,
    copy,
    validation: report.validation.filter(
      (issue) => !REMOVED_VALIDATION_IDS.has(issue.id) && !REMOVED_PAGE_IDS.has(String(issue.pageId || ""))
    ),
    sources: report.sources.filter((item) => !REMOVED_PAGE_IDS.has(String(item.pageId || "")))
  };
}

export function reportDir(period: string) {
  return path.join(REPORTS_ROOT, period);
}

export function reportJsonPath(period: string) {
  return path.join(reportDir(period), "report.json");
}

export function sourceDir(period: string) {
  return path.join(reportDir(period), "source");
}

export function exportDir(period: string, exportId: string) {
  return path.join(reportDir(period), "exports", exportId);
}

export async function ensureReportFolders(period: string) {
  await fs.mkdir(sourceDir(period), { recursive: true });
  await fs.mkdir(path.join(reportDir(period), "exports"), { recursive: true });
}

export async function readReport(period: string): Promise<Report | null> {
  try {
    const raw = await fs.readFile(reportJsonPath(period), "utf8");
    return normalizeReport(JSON.parse(raw) as Report);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeReport(report: Report) {
  await ensureReportFolders(report.period);
  await fs.writeFile(reportJsonPath(report.period), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export async function listReports(): Promise<ReportListItem[]> {
  await fs.mkdir(REPORTS_ROOT, { recursive: true });
  const entries = await fs.readdir(REPORTS_ROOT, { withFileTypes: true });
  const reports: ReportListItem[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const report = await readReport(entry.name);
    if (!report) continue;
    reports.push({
      period: report.period,
      year: report.year,
      month: report.month,
      updatedAt: report.updatedAt,
      validationErrors: report.validation.filter((issue) => issue.severity === "error").length,
      exports: report.exports.length
    });
  }
  return reports.sort((a, b) => b.period.localeCompare(a.period));
}

export async function copyFileIntoReport(period: string, from: string, filename: string) {
  await ensureReportFolders(period);
  const target = path.join(sourceDir(period), filename);
  await fs.copyFile(from, target);
  return target;
}
