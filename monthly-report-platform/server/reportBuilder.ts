import path from "node:path";
import XLSX from "xlsx";
import type {
  ClearanceRow,
  CompanyMetric,
  KeyCompany,
  PageCopy,
  PageId,
  Report,
  ReportPage,
  SourceTrace,
  SpaceResourceRow,
  SummaryMetric,
  ValidationIssue
} from "../shared/report.js";
import { PAGE_ORDER, PPT_LAYOUT_MAP } from "../shared/report.js";
import { STANDARD_COMPANY_ORDER, SUMMARY_NAMES } from "./constants.js";
import { parseSupplementWorkbook } from "./supplement.js";

type Rows = unknown[][];

interface BuildInput {
  period: string;
  year: number;
  month: number;
  files: {
    analysis?: string;
    brief?: string;
    supplement?: string;
  };
  priorReport?: Report | null;
}

function nowIso() {
  return new Date().toISOString();
}

function workbookRows(filePath: string | undefined, sheetName: string): Rows {
  if (!filePath) return [];
  const wb = XLSX.readFile(filePath, { cellFormula: true, cellDates: false });
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
}

function str(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace("%", "").replace(",", "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pct(value: unknown): number | null {
  const n = num(value);
  if (n == null) return null;
  return Math.abs(n) <= 1.5 ? n * 100 : n;
}

function pp(value: unknown): number | null {
  const n = num(value);
  if (n == null) return null;
  return Math.abs(n) <= 1.5 ? n * 100 : n;
}

function fmtPct(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

function fmtPp(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}pp`;
}

function sortCompanies(rows: CompanyMetric[]) {
  return [...rows].sort((a, b) => {
    const ai = STANDARD_COMPANY_ORDER.indexOf(a.company);
    const bi = STANDARD_COMPANY_ORDER.indexOf(b.company);
    if (ai === -1 && bi === -1) return a.company.localeCompare(b.company, "zh-CN");
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function uniqueCompanies(rows: CompanyMetric[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!isCompanyName(row.company) || seen.has(row.company)) {
      return false;
    }
    seen.add(row.company);
    return true;
  });
}

function isCompanyName(company: string) {
  return Boolean(
    company &&
    !seenNonCompanyName(company) &&
    !SUMMARY_NAMES.has(company)
  );
}

function seenNonCompanyName(company: string) {
  return (
    company === "公司" ||
    company.startsWith("·") ||
    company.startsWith("*") ||
    company.includes("简报") ||
    company.includes("说明") ||
    company.includes("备注") ||
    company.includes("数据") ||
    company.includes("收入")
  );
}

function uniqueByCompany<T extends { company: string }>(rows: T[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!isCompanyName(row.company) || seen.has(row.company)) return false;
    seen.add(row.company);
    return true;
  });
}

function topBy(rows: CompanyMetric[], selector: (row: CompanyMetric) => number | null | undefined) {
  return rows
    .filter((row) => selector(row) != null)
    .sort((a, b) => Number(selector(b)) - Number(selector(a)))[0];
}

function bottomBy(rows: CompanyMetric[], selector: (row: CompanyMetric) => number | null | undefined) {
  return rows
    .filter((row) => selector(row) != null)
    .sort((a, b) => Number(selector(a)) - Number(selector(b)))[0];
}

function metric(label: string, value: string, tone: SummaryMetric["tone"] = "blue", sublabel?: string): SummaryMetric {
  return { label, value, tone, sublabel };
}

function key(label: string, row: CompanyMetric | undefined, value: string, tone: KeyCompany["tone"] = "blue"): KeyCompany {
  return { label, company: row?.company || "—", value, tone };
}

function source(
  id: string,
  pageId: PageId,
  label: string,
  fileKind: SourceTrace["fileKind"],
  filePath: string | undefined,
  sheet: string,
  range: string
): SourceTrace {
  return {
    id,
    pageId,
    label,
    fileKind,
    fileName: filePath ? path.basename(filePath) : "未上传",
    sheet,
    range,
    updatedAt: nowIso()
  };
}

function sourceForPage(pageId: PageId) {
  return [`src-${pageId}`];
}

function rowsFromOverall(filePath?: string) {
  const rows = workbookRows(filePath, "整体").slice(5);
  return rows.filter((row) => str(row[0]));
}

function targetsFromAnalysis(filePath?: string) {
  const rows = workbookRows(filePath, "收费率").slice(3);
  const targetMap = new Map<string, number>();
  for (const row of rows) {
    const company = str(row[0]);
    if (!company && targetMap.size) break;
    const target = pct(row[9]);
    if (company && target != null) targetMap.set(company, target);
  }
  return targetMap;
}

function overallCompanies(filePath: string | undefined, mode: "current" | "arrears") {
  const rows = rowsFromOverall(filePath);
  const offset = mode === "current" ? 0 : 8;
  const companyRows: CompanyMetric[] = [];
  let summary: CompanyMetric | undefined;
  for (const row of rows) {
    const company = str(row[0]);
    const item: CompanyMetric = {
      company,
      amount: num(row[2 + offset]),
      current: pct(row[3 + offset]),
      previous: pct(row[6 + offset]),
      delta: pp(row[8 + offset])
    };
    if (SUMMARY_NAMES.has(company)) summary = { ...item, company: "集团" };
    else if (company) companyRows.push(item);
  }
  return { companies: sortCompanies(uniqueCompanies(companyRows)), summary };
}

function splitCompanies(filePath: string | undefined, sheetName: string, firstLabel: string, secondLabel: string) {
  const rows = workbookRows(filePath, sheetName).slice(5);
  const left = sortCompanies(
    uniqueCompanies(
      rows
      .map((row) => ({
        company: str(row[0]),
        current: pct(row[3]),
        previous: pct(row[6]),
        delta: pp(row[8]),
        category: firstLabel
      }))
    )
  );
  const right = sortCompanies(
    uniqueCompanies(
      rows
      .map((row) => ({
        company: str(row[0]),
        current: pct(row[11]),
        previous: pct(row[14]),
        delta: pp(row[16]),
        category: secondLabel
      }))
    )
  );
  const merged = left.map((row) => ({
    ...row,
    secondary: right.find((item) => item.company === row.company)?.current ?? null,
    category: `${firstLabel}/${secondLabel}`
  }));
  return { left: merged, right };
}

function clearanceCompanies(filePath?: string) {
  const rows = workbookRows(filePath, "基础指标").slice(2);
  return sortCompanies(
    uniqueCompanies(
      rows
      .map((row) => ({
        company: str(row[0]),
        current: pct(row[4]),
        amount: num(row[3]),
        target: num(row[2]),
        secondary: pct(row[8])
      }))
    )
  );
}

function spaceCompanies(filePath?: string) {
  const rows = workbookRows(filePath, "空间资源").slice(2);
  return sortCompanies(
    uniqueCompanies(
      rows
      .map((row) => {
        const target = num(row[3]);
        const booked = num(row[4]);
        return {
          company: str(row[0]),
          current: target && booked != null ? (booked / target) * 100 : null,
          previous: num(row[1]),
          amount: booked,
          target,
          secondary: num(row[9]),
          delta: num(row[11])
        };
      })
    )
  );
}

function clearanceData(filePath?: string) {
  const rows = workbookRows(filePath, "基础指标").slice(2);
  const detailRows: ClearanceRow[] = uniqueByCompany(
    rows.map((row) => ({
      company: str(row[0]),
      selfTotal: num(row[1]),
      selfTarget: num(row[2]),
      selfCollected: num(row[3]),
      selfRate: pct(row[4]),
      externalTotal: num(row[5]),
      externalTarget: num(row[6]),
      externalCollected: num(row[7]),
      externalRate: pct(row[8])
    }))
  );
  const metrics = sortCompanies(
    uniqueCompanies(
      detailRows.map((row) => ({
        company: row.company,
        current: row.selfRate,
        amount: row.selfCollected,
        target: row.selfTarget,
        secondary: row.externalRate
      }))
    )
  );
  return { metrics, detailRows };
}

function spaceData(filePath?: string) {
  const rows = workbookRows(filePath, "空间资源").slice(2);
  const detailRows: SpaceResourceRow[] = uniqueByCompany(
    rows.map((row) => ({
      company: str(row[0]),
      lastYear: num(row[1]),
      budget: num(row[2]),
      target: num(row[3]),
      booked: num(row[4]),
      bookedYoY: num(row[5]),
      pendingBooked: num(row[6]),
      pendingRenewal: num(row[7]),
      forecast: num(row[8]),
      gap: num(row[9]),
      previousGap: num(row[10]),
      newAmount: num(row[11]),
      remark: str(row[12]) || undefined
    }))
  );
  const metrics = sortCompanies(
    uniqueCompanies(
      detailRows.map((row) => ({
        company: row.company,
        current: row.target && row.booked != null ? (row.booked / row.target) * 100 : null,
        previous: row.lastYear,
        amount: row.booked,
        target: row.target,
        secondary: row.gap,
        delta: row.newAmount
      }))
    )
  );
  return { metrics, detailRows };
}

function generatedBullets(page: ReportPage) {
  const max = topBy(page.companies, (row) => row.current);
  const min = bottomBy(page.companies, (row) => row.current);
  const improved = topBy(page.companies, (row) => row.delta);
  const summary = page.metrics[0]?.value || "—";
  const target = page.metrics[2]?.value || "—";
  return [
    `${page.title}核心指标为${summary}，目标完成${target}，需持续关注低于集团均值或目标进度的公司。`,
    `${max?.company || "—"}表现领先，${min?.company || "—"}处于低位；${improved?.company || "—"}改善最明显。`
  ];
}

function copyFromPage(page: ReportPage): PageCopy {
  const bullets = generatedBullets(page);
  return {
    mainConclusion: bullets[0],
    keyCompanies: page.keyCompanies.map((item) => `${item.label}：${item.company} ${item.value}`).join("；"),
    reason: bullets[1],
    note: "",
    updatedAt: nowIso(),
    history: []
  };
}

function mergeCopy(pages: ReportPage[], prior?: Report | null): Record<PageId, PageCopy> {
  const copy = {} as Record<PageId, PageCopy>;
  for (const page of pages) {
    copy[page.id] = prior?.copy?.[page.id] || copyFromPage(page);
  }
  return copy;
}

function makePage(
  page: Omit<ReportPage, "bullets" | "layout" | "templateSlide"> &
    Partial<Pick<ReportPage, "layout" | "templateSlide">> & { bullets?: string[] }
): ReportPage {
  const template = PPT_LAYOUT_MAP[page.id];
  const withBullets = {
    ...page,
    layout: page.layout || template.layout,
    templateSlide: page.templateSlide || template.templateSlide,
    bullets: page.bullets || []
  };
  if (!withBullets.bullets.length) withBullets.bullets = generatedBullets(withBullets);
  return withBullets;
}

export function regenerateCopyForPage(report: Report, pageId: PageId): Report {
  const page = report.pages.find((item) => item.id === pageId);
  if (!page) return report;
  const existing = report.copy[pageId];
  const next = copyFromPage(page);
  next.history = [
    ...(existing?.history || []),
    {
      at: nowIso(),
      fields: {
        mainConclusion: existing?.mainConclusion || "",
        keyCompanies: existing?.keyCompanies || "",
        reason: existing?.reason || "",
        note: existing?.note || "",
        updatedAt: existing?.updatedAt
      }
    }
  ];
  return {
    ...report,
    updatedAt: nowIso(),
    copy: { ...report.copy, [pageId]: next }
  };
}

export function buildReport(input: BuildInput): Report {
  const sources: SourceTrace[] = [];
  const validation: ValidationIssue[] = [];

  if (!input.files.brief) {
    validation.push({ id: "missing-brief", severity: "error", message: "缺少经营简报 Excel。" });
  }
  if (!input.files.analysis) {
    validation.push({ id: "missing-analysis", severity: "error", message: "缺少数据分析 Excel。" });
  }
  if (!input.files.supplement) {
    validation.push({ id: "missing-supplement", severity: "error", message: "缺少补充数据 Excel。" });
  }

  const targets = targetsFromAnalysis(input.files.analysis);
  const current = overallCompanies(input.files.brief, "current");
  const arrears = overallCompanies(input.files.brief, "arrears");
  const currentTargetAverage =
    current.companies.reduce((sum, row) => sum + (targets.get(row.company) || 0), 0) /
    Math.max(current.companies.filter((row) => targets.has(row.company)).length, 1);
  const supplement = parseSupplementWorkbook(input.files.supplement);

  const pages: ReportPage[] = [];
  const currentMax = topBy(current.companies, (row) => row.current);
  const currentMin = bottomBy(current.companies, (row) => row.current);
  const currentImprove = topBy(current.companies, (row) => row.delta);
  const currentSummary = current.summary?.current ?? null;
  const currentCompletion =
    currentSummary != null && currentTargetAverage ? (currentSummary / currentTargetAverage) * 100 : null;
  pages.push(
    makePage({
      id: "current-overview",
      order: 1,
      title: `${input.year}年${input.month}月运营回顾`,
      subtitle: "当期收费率",
      chartTitle: "各公司当期收费率对比",
      kind: "bar-compare",
      metrics: [
        metric("集团当期综合收费率", fmtPct(currentSummary), "blue"),
        metric("同比", fmtPp(current.summary?.delta), Number(current.summary?.delta || 0) >= 0 ? "green" : "red"),
        metric("目标完成", fmtPct(currentCompletion), "blue")
      ],
      keyCompanies: [
        key("最高", currentMax, fmtPct(currentMax?.current), "blue"),
        key("最低", currentMin, fmtPct(currentMin?.current), "red"),
        key("最大提升", currentImprove, fmtPp(currentImprove?.delta), "green")
      ],
      companies: current.companies,
      sourceIds: sourceForPage("current-overview")
    })
  );
  sources.push(source("src-current-overview", "current-overview", "当期收费率", "brief", input.files.brief, "整体", "A6:I35"));

  const currentSplit = splitCompanies(input.files.brief, "当期-费项", "直收项", "代收项");
  const currentSplitLeft = currentSplit.left;
  const currentSplitRight = currentSplit.right;
  pages.push(
    makePage({
      id: "current-split",
      order: 2,
      title: `${input.year}年${input.month}月运营回顾`,
      subtitle: "当期收费率",
      chartTitle: "自建项目与代收项收费率对比",
      kind: "split-bars",
      metrics: [
        metric("自建直收均值", fmtPct(avg(currentSplitLeft, "current")), "blue"),
        metric("直收同比", fmtPp(avg(currentSplitLeft, "delta")), Number(avg(currentSplitLeft, "delta") || 0) >= 0 ? "green" : "red"),
        metric("代收项均值", fmtPct(avg(currentSplitRight, "current")), "blue")
      ],
      keyCompanies: [
        key("直收最高", topBy(currentSplitLeft, (row) => row.current), fmtPct(topBy(currentSplitLeft, (row) => row.current)?.current), "blue"),
        key("直收最低", bottomBy(currentSplitLeft, (row) => row.current), fmtPct(bottomBy(currentSplitLeft, (row) => row.current)?.current), "red"),
        key("改善最大", topBy(currentSplitLeft, (row) => row.delta), fmtPp(topBy(currentSplitLeft, (row) => row.delta)?.delta), "green")
      ],
      companies: currentSplitLeft,
      secondaryCompanies: currentSplitRight,
      data: { splitLeftTitle: "自建项目", splitRightTitle: "外拓项目" },
      sourceIds: sourceForPage("current-split")
    })
  );
  sources.push(source("src-current-split", "current-split", "当期收费率拆分", "brief", input.files.brief, "当期-费项", "A6:Q43"));

  const arrearsMax = topBy(arrears.companies, (row) => row.current);
  const arrearsMin = bottomBy(arrears.companies, (row) => row.current);
  const arrearsImprove = topBy(arrears.companies, (row) => row.delta);
  pages.push(
    makePage({
      id: "arrears-overview",
      order: 3,
      title: `${input.year}年${input.month}月运营回顾`,
      subtitle: "历欠收费率",
      chartTitle: "各公司历欠收费率对比",
      kind: "bar-compare",
      metrics: [
        metric("集团历欠综合收费率", fmtPct(arrears.summary?.current), "blue"),
        metric("同比", fmtPp(arrears.summary?.delta), Number(arrears.summary?.delta || 0) >= 0 ? "green" : "red"),
        metric("回款金额", `${Math.round(arrears.summary?.amount || 0)}万`, "blue")
      ],
      keyCompanies: [
        key("最高", arrearsMax, fmtPct(arrearsMax?.current), "blue"),
        key("最低", arrearsMin, fmtPct(arrearsMin?.current), "red"),
        key("最大提升", arrearsImprove, fmtPp(arrearsImprove?.delta), "green")
      ],
      companies: arrears.companies,
      sourceIds: sourceForPage("arrears-overview")
    })
  );
  sources.push(source("src-arrears-overview", "arrears-overview", "历欠收费率", "brief", input.files.brief, "整体", "J6:Q35"));

  const arrearsSplit = splitCompanies(input.files.brief, "历欠-账龄", "1年以内", "2-3年");
  const arrearsSplitLeft = arrearsSplit.left;
  const arrearsSplitRight = arrearsSplit.right;
  pages.push(
    makePage({
      id: "arrears-split",
      order: 4,
      title: `${input.year}年${input.month}月运营回顾`,
      subtitle: "历欠收费率",
      chartTitle: "按账龄拆分回款率对比",
      kind: "split-bars",
      metrics: [
        metric("1年以内均值", fmtPct(avg(arrearsSplitLeft, "current")), "blue"),
        metric("同比", fmtPp(avg(arrearsSplitLeft, "delta")), Number(avg(arrearsSplitLeft, "delta") || 0) >= 0 ? "green" : "red"),
        metric("2-3年均值", fmtPct(avg(arrearsSplitRight, "current")), "blue")
      ],
      keyCompanies: [
        key("1年内最高", topBy(arrearsSplitLeft, (row) => row.current), fmtPct(topBy(arrearsSplitLeft, (row) => row.current)?.current), "blue"),
        key("1年内最低", bottomBy(arrearsSplitLeft, (row) => row.current), fmtPct(bottomBy(arrearsSplitLeft, (row) => row.current)?.current), "red"),
        key("改善最大", topBy(arrearsSplitLeft, (row) => row.delta), fmtPp(topBy(arrearsSplitLeft, (row) => row.delta)?.delta), "green")
      ],
      companies: arrearsSplitLeft,
      secondaryCompanies: arrearsSplitRight,
      data: { splitLeftTitle: "自建项目", splitRightTitle: "外拓项目" },
      sourceIds: sourceForPage("arrears-split")
    })
  );
  sources.push(source("src-arrears-split", "arrears-split", "历欠收费率拆分", "brief", input.files.brief, "历欠-账龄", "A6:Q43"));

  const clearanceSource = clearanceData(input.files.brief);
  const clearance = clearanceSource.metrics;
  pages.push(
    makePage({
      id: "clearance",
      order: 5,
      title: `${input.year}年${input.month}月运营回顾`,
      subtitle: "清欠专项活动",
      chartTitle: "基础指标完成率",
      kind: "clearance",
      metrics: [
        metric("整体完成率", fmtPct(avg(clearance, "current")), "blue"),
        metric("自建回款", `${Math.round(sum(clearance, "amount"))}万`, "blue"),
        metric("外拓完成率", fmtPct(avg(clearance, "secondary")), "blue")
      ],
      keyCompanies: [
        key("完成率最高", topBy(clearance, (row) => row.current), fmtPct(topBy(clearance, (row) => row.current)?.current), "blue"),
        key("完成率最低", bottomBy(clearance, (row) => row.current), fmtPct(bottomBy(clearance, (row) => row.current)?.current), "red"),
        key("外拓最高", topBy(clearance, (row) => row.secondary), fmtPct(topBy(clearance, (row) => row.secondary)?.secondary), "green")
      ],
      companies: clearance,
      data: { clearanceRows: clearanceSource.detailRows },
      sourceIds: sourceForPage("clearance")
    })
  );
  sources.push(source("src-clearance", "clearance", "清欠专项活动", "brief", input.files.brief, "基础指标", "A3:I34"));

  const spaceSource = spaceData(input.files.brief);
  const space = spaceSource.metrics;
  pages.push(
    makePage({
      id: "space",
      order: 6,
      title: `${input.year}年${input.month}月运营回顾`,
      subtitle: "空间资源",
      chartTitle: "空间资源指标完成情况",
      kind: "space",
      metrics: [
        metric("已入账", `${Math.round(sum(space, "amount"))}万`, "blue"),
        metric("平均完成率", fmtPct(avg(space, "current")), "blue"),
        metric("业绩缺口", `${Math.round(sum(space, "secondary"))}万`, Number(sum(space, "secondary")) >= 0 ? "green" : "red")
      ],
      keyCompanies: [
        key("完成率最高", topBy(space, (row) => row.current), fmtPct(topBy(space, (row) => row.current)?.current), "blue"),
        key("缺口最大", bottomBy(space, (row) => row.secondary), `${Math.round(bottomBy(space, (row) => row.secondary)?.secondary || 0)}万`, "red"),
        key("新增最多", topBy(space, (row) => row.delta), `${Math.round(topBy(space, (row) => row.delta)?.delta || 0)}万`, "green")
      ],
      companies: space,
      data: { spaceRows: spaceSource.detailRows },
      sourceIds: sourceForPage("space")
    })
  );
  sources.push(source("src-space", "space", "空间资源", "brief", input.files.brief, "空间资源", "A3:O21"));

  pages.push(
    makePage({
      id: "charging",
      order: 7,
      title: `${input.year}年${input.month}月运营回顾`,
      subtitle: "充电桩",
      chartTitle: "充电桩收入与利润情况",
      kind: "dual-table",
      metrics: [
        metric("收入", `${supplement.charging.summary.income}万`, "blue", fmtPp(supplement.charging.summary.incomeYoY)),
        metric("毛利额", `${supplement.charging.summary.grossProfit}万`, "blue"),
        metric("利润率", fmtPct(supplement.charging.summary.profitRate), "green")
      ],
      keyCompanies: [
        key("利润最高", topBy(supplement.charging.rows, (row) => row.current), fmtPct(topBy(supplement.charging.rows, (row) => row.current)?.current), "blue"),
        key("自营最高", topBy(supplement.charging.rows, (row) => row.secondary), fmtPct(topBy(supplement.charging.rows, (row) => row.secondary)?.secondary), "green"),
        key("增长最高", topBy(supplement.charging.rows, (row) => row.delta), fmtPp(topBy(supplement.charging.rows, (row) => row.delta)?.delta), "green")
      ],
      companies: supplement.charging.rows,
      sourceIds: sourceForPage("charging")
    })
  );
  sources.push(source("src-charging", "charging", "充电桩", "supplement", input.files.supplement, "充电桩", "A2:E20"));

  pages.push(
    makePage({
      id: "repair",
      order: 8,
      title: `${input.year}年${input.month}月运营回顾`,
      subtitle: "入户维修满意度",
      chartTitle: "入户维修满意度与响应及时率",
      kind: "quadrant",
      metrics: [
        metric("集团满意度", fmtPct(avg(supplement.repair, "current")), "blue"),
        metric("同比", fmtPp(avg(supplement.repair, "delta")), Number(avg(supplement.repair, "delta") || 0) >= 0 ? "green" : "red"),
        metric("响应及时率", fmtPct(avg(supplement.repair, "secondary")), "blue")
      ],
      keyCompanies: [
        key("满意度最高", topBy(supplement.repair, (row) => row.current), fmtPct(topBy(supplement.repair, (row) => row.current)?.current), "blue"),
        key("响应最低", bottomBy(supplement.repair, (row) => row.secondary), fmtPct(bottomBy(supplement.repair, (row) => row.secondary)?.secondary), "red"),
        key("改善最大", topBy(supplement.repair, (row) => row.delta), fmtPp(topBy(supplement.repair, (row) => row.delta)?.delta), "green")
      ],
      companies: supplement.repair,
      sourceIds: sourceForPage("repair")
    })
  );
  sources.push(source("src-repair", "repair", "入户维修满意度", "supplement", input.files.supplement, "入户维修", "A2:D20"));

  pages.push(
    makePage({
      id: "complaints",
      order: 9,
      title: `${input.year}年${input.month}月运营回顾`,
      subtitle: "投诉管理",
      chartTitle: "投诉率与投诉处理满意度",
      kind: "dual-table",
      metrics: [
        metric("集团投诉率", fmtPct(avg(supplement.complaints, "current")), "blue"),
        metric("投诉率同比", fmtPp(avg(supplement.complaints, "delta")), Number(avg(supplement.complaints, "delta") || 0) <= 0 ? "green" : "red"),
        metric("处理满意度", fmtPct(avg(supplement.complaints, "secondary")), "blue")
      ],
      keyCompanies: [
        key("投诉率最高", topBy(supplement.complaints, (row) => row.current), fmtPct(topBy(supplement.complaints, (row) => row.current)?.current), "red"),
        key("满意度最低", bottomBy(supplement.complaints, (row) => row.secondary), fmtPct(bottomBy(supplement.complaints, (row) => row.secondary)?.secondary), "red"),
        key("满意度提升", topBy(supplement.complaints, (row) => row.target), fmtPp(topBy(supplement.complaints, (row) => row.target)?.target), "green")
      ],
      companies: supplement.complaints,
      sourceIds: sourceForPage("complaints")
    })
  );
  sources.push(source("src-complaints", "complaints", "投诉管理", "supplement", input.files.supplement, "投诉管理", "A2:E20"));

  for (const pageInfo of PAGE_ORDER) {
    const page = pages.find((item) => item.id === pageInfo.id);
    if (!page || page.companies.length === 0) {
      validation.push({
        id: `empty-${pageInfo.id}`,
        severity: "error",
        pageId: pageInfo.id,
        message: `${pageInfo.title}缺少可展示数据。`
      });
    }
  }

  return {
    period: input.period,
    year: input.year,
    month: input.month,
    createdAt: input.priorReport?.createdAt || nowIso(),
    updatedAt: nowIso(),
    files: {
      analysis: input.files.analysis ? path.basename(input.files.analysis) : undefined,
      brief: input.files.brief ? path.basename(input.files.brief) : undefined,
      supplement: input.files.supplement ? path.basename(input.files.supplement) : undefined
    },
    pages: pages.sort((a, b) => a.order - b.order),
    copy: mergeCopy(pages, input.priorReport),
    validation,
    sources,
    exports: input.priorReport?.exports || []
  };
}

function avg(rows: CompanyMetric[], keyName: keyof CompanyMetric) {
  const values = rows.map((row) => row[keyName]).filter((value): value is number => typeof value === "number");
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function sum(rows: CompanyMetric[], keyName: keyof CompanyMetric) {
  return rows.reduce((total, row) => total + (typeof row[keyName] === "number" ? Number(row[keyName]) : 0), 0);
}
