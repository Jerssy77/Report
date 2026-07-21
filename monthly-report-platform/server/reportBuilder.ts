import path from "node:path";
import XLSX from "xlsx";
import type {
  ClearanceRow,
  CompanyMetric,
  EnergyCostRow,
  EquipmentHealthRow,
  KeyCompany,
  PageCopy,
  PageId,
  Report,
  ReportPage,
  SatisfactionScoreRow,
  SourceTrace,
  SpaceResourceRow,
  SummaryMetric,
  ValidationIssue
} from "../shared/report.js";
import { PAGE_ORDER, PPT_LAYOUT_MAP } from "../shared/report.js";
import { EXCLUDED_COMPANY_NAMES, STANDARD_COMPANY_ORDER, SUMMARY_NAMES } from "./constants.js";

type Rows = unknown[][];

interface BuildInput {
  period: string;
  year: number;
  month: number;
  files: {
    analysis?: string;
    brief?: string;
    resident?: string;
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

function findHeaderIndex(row: unknown[], keywords: string[]) {
  return row.findIndex((cell) => {
    const text = str(cell);
    return keywords.every((keyword) => text.includes(keyword));
  });
}

function ratioChange(current: number | null, previous: number | null) {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function yuanToWan(value: number | null | undefined) {
  return value == null ? null : value / 10000;
}

function fmtPct(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

function fmtPp(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function fmtScore(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}分`;
}

function fmtAmount(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}万`;
}

function fmtCount(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value).toLocaleString("zh-CN")}件`;
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
    !EXCLUDED_COMPANY_NAMES.has(company) &&
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
    company.includes("收入") ||
    company.includes("年")
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

function completeCompanyMetrics(rows: CompanyMetric[]) {
  const byCompany = new Map(uniqueCompanies(rows).map((row) => [row.company, row]));
  return STANDARD_COMPANY_ORDER.map((company) => byCompany.get(company) || {
    company,
    current: null,
    previous: null,
    target: null,
    delta: null,
    amount: null,
    secondary: null
  });
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

function scoreBlockRange(month: number) {
  const pairIndex = Math.floor((Math.min(Math.max(month, 1), 12) - 1) / 2);
  const titleRow = 20 + pairIndex * 18;
  const headerRow = titleRow + 1;
  const endRow = headerRow + 15;
  const startCol = month % 2 === 1 ? "A" : "Q";
  const endCol = month % 2 === 1 ? "M" : "AC";
  return `${startCol}${headerRow}:${endCol}${endRow}`;
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

function equipmentHealthData(filePath?: string) {
  const allRows = workbookRows(filePath, "设备设施管理");
  const header = allRows.find((row) => str(row[0]) === "公司" || str(row[5]) === "公司") || [];
  const hasElevatorFault = header.some((cell) => str(cell).includes("电梯故障率"));
  const scoreIndex = findHeaderIndex(header, ["得分"]);
  const weightedScoreIndex = findHeaderIndex(header, ["权重得分"]);
  const rows = allRows.filter((row) => str(row[0]) || str(row[5]));
  const detailRows: EquipmentHealthRow[] = [];
  let summary: EquipmentHealthRow | undefined;

  for (const row of rows.slice(1)) {
    const company = str(row[0]) || str(row[5]);
    if (!company || company === "公司") continue;
    const item: EquipmentHealthRow = {
      company,
      inspectionRate: pct(row[1]),
      maintenanceRate: pct(row[2]),
      onsiteFactor: hasElevatorFault ? null : num(row[3]),
      elevatorFaultRate: hasElevatorFault ? pct(row[3]) : null,
      score: num(row[scoreIndex >= 0 ? scoreIndex : 6]),
      weightedScore: weightedScoreIndex >= 0 ? num(row[weightedScoreIndex]) : null
    };
    if (SUMMARY_NAMES.has(company)) summary = { ...item, company: "集团" };
    else if (isCompanyName(company)) detailRows.push(item);
  }

  const uniqueRows = uniqueByCompany(detailRows);
  const metrics = sortCompanies(
    uniqueCompanies(
      uniqueRows.map((row) => ({
        company: row.company,
        current: row.score,
        target: 100,
        secondary: row.weightedScore,
        previous: row.inspectionRate,
        delta: row.maintenanceRate,
        amount: row.elevatorFaultRate ?? row.onsiteFactor
      }))
    )
  );
  return { metrics, detailRows: uniqueRows, summary };
}

function energyCostData(filePath?: string) {
  const allRows = workbookRows(filePath, "自用能耗成本");
  const header = allRows.find((row) => str(row[0]) === "公司" || str(row[8]) === "公司") || [];
  const companyIndex = findHeaderIndex(header, ["公司"]);
  const waterCost26Index = findHeaderIndex(header, ["水费成本"]);
  const waterCost25Index = findHeaderIndex(header, ["25", "水费成本"]);
  const electricityCost26Index = findHeaderIndex(header, ["电费成本"]);
  const electricityCost25Index = findHeaderIndex(header, ["25", "电费成本"]);
  const totalCost26Index = findHeaderIndex(header, ["合计成本"]);
  const totalCost25Index = findHeaderIndex(header, ["25", "合计成本"]);
  const costYoYIndex = findHeaderIndex(header, ["较25年变化率"]);
  const hasCostCompare = waterCost25Index >= 0 && totalCost25Index >= 0;
  const scoreIndex = findHeaderIndex(header, ["得分"]);
  const weightedScoreIndex = findHeaderIndex(header, ["权重得分"]);
  const rows = allRows.filter((row) => str(row[companyIndex >= 0 ? companyIndex : 0]) || str(row[8]));
  const detailRows: EnergyCostRow[] = [];
  let summary: EnergyCostRow | undefined;

  for (const row of rows.slice(header.length ? 1 : 2)) {
    const company = str(row[companyIndex >= 0 ? companyIndex : 0]) || str(row[8]);
    if (!company || company === "公司") continue;
    const totalCost25Raw = hasCostCompare ? num(row[totalCost25Index]) : null;
    const totalCost26Raw = hasCostCompare ? num(row[totalCost26Index]) : null;
    const totalCost25 = yuanToWan(totalCost25Raw);
    const totalCost26 = yuanToWan(totalCost26Raw);
    const costYoY = hasCostCompare ? pp(row[costYoYIndex]) ?? ratioChange(totalCost26Raw, totalCost25Raw) : null;
    const item: EnergyCostRow = {
      company,
      income: hasCostCompare ? null : num(row[1]),
      cost: hasCostCompare ? totalCost26 : num(row[2]),
      waterCost25: hasCostCompare ? yuanToWan(num(row[waterCost25Index])) : null,
      waterCost26: hasCostCompare ? yuanToWan(num(row[waterCost26Index])) : null,
      electricityCost25: hasCostCompare ? yuanToWan(num(row[electricityCost25Index])) : null,
      electricityCost26: hasCostCompare ? yuanToWan(num(row[electricityCost26Index])) : null,
      totalCost25,
      totalCost26,
      costYoY,
      marginRate: hasCostCompare ? null : pct(row[3]),
      previousMarginRate: hasCostCompare ? null : pct(row[4]),
      delta: hasCostCompare ? costYoY : pp(row[5]),
      adjustment: hasCostCompare ? undefined : str(row[6]) || undefined,
      score: num(row[scoreIndex >= 0 ? scoreIndex : 9]),
      weightedScore: weightedScoreIndex >= 0 ? num(row[weightedScoreIndex]) : null
    };
    if (SUMMARY_NAMES.has(company)) summary = { ...item, company: "集团" };
    else if (isCompanyName(company)) detailRows.push(item);
  }

  const uniqueRows = uniqueByCompany(detailRows);
  const metrics = sortCompanies(
    uniqueCompanies(
      uniqueRows.map((row) => ({
        company: row.company,
        current: row.totalCost26 ?? row.cost,
        previous: row.totalCost25 ?? null,
        amount: row.waterCost26 ?? null,
        secondary: row.electricityCost26 ?? null,
        delta: row.delta
      }))
    )
  );
  return { metrics, detailRows: uniqueRows, summary, mode: hasCostCompare ? "cost-compare" as const : "margin" as const };
}

function scoreDistributionData(
  filePath: string | undefined,
  sheetName: string,
  residentHouseholds?: Map<string, number>,
  preferredTitle?: string
) {
  const allRows = workbookRows(filePath, sheetName);
  const blocks: Array<{ title: string; rows: SatisfactionScoreRow[]; summary?: SatisfactionScoreRow }> = [];

  for (let rowIndex = 0; rowIndex < allRows.length; rowIndex += 1) {
    const header = allRows[rowIndex];
    for (let colIndex = 0; colIndex <= header.length - 13; colIndex += 1) {
      if (str(header[colIndex]) !== "公司") continue;
      if (!str(header[colIndex + 1]).includes("1")) continue;
      if (!str(header[colIndex + 11]).includes("合计") || !str(header[colIndex + 12]).includes("满意度")) continue;
      let title = "";
      for (let lookup = rowIndex - 1; lookup >= 0; lookup -= 1) {
        title = str(allRows[lookup]?.[colIndex]);
        if (title) break;
      }
      const blockRows: SatisfactionScoreRow[] = [];
      let summary: SatisfactionScoreRow | undefined;
      for (let dataIndex = rowIndex + 1; dataIndex < allRows.length; dataIndex += 1) {
        const sourceRow = allRows[dataIndex];
        const company = str(sourceRow[colIndex]);
        if (company === "公司") break;
        if (!company) continue;
        if (company === "投诉+报修") break;
        const bins = Array.from({ length: 10 }, (_, index) => num(sourceRow[colIndex + 1 + index]) || 0);
        const total = num(sourceRow[colIndex + 11]) ?? bins.reduce((sum, value) => sum + value, 0);
        const score = num(sourceRow[colIndex + 12]);
        const low = bins.slice(0, 6).reduce((sum, value) => sum + value, 0);
        const high = bins.slice(6).reduce((sum, value) => sum + value, 0);
        const denominator = total && total > 0 ? total : low + high;
        const households = residentHouseholds?.get(company) ?? null;
        const complaintRate = households && total != null ? (total / households) * 100 : null;
        const item: SatisfactionScoreRow = {
          company,
          bins,
          total,
          score,
          lowShare: denominator ? (low / denominator) * 100 : null,
          highShare: denominator ? (high / denominator) * 100 : null,
          scoreDelta: null,
          residentHouseholds: households,
          complaintRate,
          complaintRateDelta: null
        };
        if (SUMMARY_NAMES.has(company) || company === "总计" || company === "合计") summary = { ...item, company: "集团" };
        else if (isCompanyName(company)) blockRows.push(item);
      }
      if (blockRows.length || summary) blocks.push({ title, rows: uniqueByCompany(blockRows), summary });
    }
  }

  const selectedCandidates = blocks.filter(
    (block) => block.title !== "投诉+报修" && block.summary?.score != null && block.rows.length >= 10
  );
  const fallbackCandidates = blocks.filter((block) => block.summary?.score != null);
  const preferred = preferredTitle
    ? selectedCandidates.find((block) => block.title === preferredTitle) ||
      fallbackCandidates.find((block) => block.title === preferredTitle)
    : undefined;
  const selected = preferred || selectedCandidates[selectedCandidates.length - 1] || fallbackCandidates[fallbackCandidates.length - 1];
  const preferredMonth = Number(preferredTitle?.match(/^(\d+)月$/)?.[1] || 0);
  const previousTitle = preferredMonth > 1 ? `${preferredMonth - 1}月` : "";
  const previous = previousTitle ? blocks.find((block) => block.title === previousTitle) : undefined;
  const previousMap = new Map((previous?.rows || []).map((row) => [row.company, row]));
  const rows = selected?.rows || [];
  const summary = selected?.summary;
  const normalizedRows = STANDARD_COMPANY_ORDER.map((company) => {
    const current = rows.find((row) => row.company === company);
    const prior = previousMap.get(company);
    const households = residentHouseholds?.get(company) ?? null;
    return {
      ...(current || {
        company,
        bins: [],
        total: null,
        score: null,
        lowShare: null,
        highShare: null,
        residentHouseholds: households,
        complaintRate: null
      }),
      previousTotal: prior?.total ?? null,
      totalDelta: ratioChange(current?.total ?? null, prior?.total ?? null),
      scoreDelta: current?.score != null && prior?.score != null ? current.score - prior.score : null,
      complaintRateDelta:
        households && current?.total != null && prior?.total != null
          ? ((current.total - prior.total) / households) * 100
          : null
    };
  });
  const previousSummary = previous?.summary;
  const groupHouseholds = residentHouseholds?.get("集团") ?? null;
  const normalizedSummary = summary
    ? {
        ...summary,
        previousTotal: previousSummary?.total ?? null,
        totalDelta: ratioChange(summary.total, previousSummary?.total ?? null),
        scoreDelta:
          summary.score != null && previousSummary?.score != null
            ? summary.score - previousSummary.score
            : null,
        complaintRateDelta:
          groupHouseholds && summary.total != null && previousSummary?.total != null
            ? ((summary.total - previousSummary.total) / groupHouseholds) * 100
            : null
      }
    : undefined;
  return {
    rows: normalizedRows,
    summary: normalizedSummary
  };
}

function residentHouseholds(filePath?: string) {
  const wbRows = workbookRows(filePath, "Sheet1");
  const values = new Map<string, number>();
  for (const row of wbRows.slice(1)) {
    const company = str(row[0]);
    const value = num(row[1]);
    if (!company || value == null) continue;
    if (SUMMARY_NAMES.has(company) || company === "合计" || company === "总计") values.set("集团", value);
    else if (isCompanyName(company)) values.set(company, value);
  }
  return values;
}

function efficiencyData(filePath: string | undefined, sheetName: string, month: number, target: number) {
  const rows = workbookRows(filePath, sheetName);
  const headerIndex = rows.findIndex((row) => str(row[0]) === "公司");
  if (headerIndex < 0) return { rows: [] as CompanyMetric[], summary: undefined as CompanyMetric | undefined };
  const monthIndex = Math.min(Math.max(month, 1), 12);
  const detailRows: CompanyMetric[] = [];
  let summary: CompanyMetric | undefined;
  for (const row of rows.slice(headerIndex + 1)) {
    const company = str(row[0]);
    if (!company) continue;
    const current = pct(row[monthIndex]) ?? pct(row[13]) ?? pct(row[16]);
    const previous = pct(row[1]);
    const item: CompanyMetric = {
      company,
      current,
      previous,
      target,
      delta: current != null && previous != null ? current - previous : null
    };
    if (SUMMARY_NAMES.has(company) || company === "总计" || company === "合计") summary = { ...item, company: "集团" };
    else if (isCompanyName(company)) detailRows.push(item);
  }
  return { rows: sortCompanies(uniqueCompanies(detailRows)), summary };
}

function generatedBullets(page: ReportPage) {
  const max = topBy(page.companies, (row) => row.current);
  const min = bottomBy(page.companies, (row) => row.current);
  const improved = topBy(page.companies, (row) => row.delta);
  const declined = bottomBy(page.companies, (row) => row.delta);
  const summary = page.metrics[0]?.value || "—";
  const targetMetric = page.metrics.find((item) => item.label.includes("目标"));
  const targetPhrase = targetMetric ? `，目标完成${targetMetric.value || "—"}` : "";

  if (page.id === "current-overview" || page.id === "arrears-overview") {
    const metricName = page.id === "current-overview" ? "当期综合收费率" : "历欠综合收费率";
    const trend = page.metrics[1]?.value || "—";
    return [
      `${metricName}${summary}，同比${trend}${targetPhrase}；${max?.company || "—"}${fmtPct(max?.current)}居首，${min?.company || "—"}${fmtPct(min?.current)}最低。`,
      `${improved?.company || "—"}同比${fmtPp(improved?.delta)}，改善最明显；${declined?.company || "—"}同比${fmtPp(declined?.delta)}，需重点跟进。`
    ];
  }

  if (page.id === "current-split" || page.id === "arrears-split") {
    const leftLabel = page.data?.splitLeftTitle || page.metrics[0]?.label || "左侧项目";
    const rightLabel = page.data?.splitRightTitle || page.metrics[2]?.label || "右侧项目";
    return [
      `${leftLabel}均值${page.metrics[0]?.value || "—"}，${rightLabel}均值${page.metrics[2]?.value || "—"}；${max?.company || "—"}${fmtPct(max?.current)}居${leftLabel}首位。`,
      `${min?.company || "—"}${fmtPct(min?.current)}处于低位；${improved?.company || "—"}同比${fmtPp(improved?.delta)}，改善最明显。`
    ];
  }

  if (page.id === "clearance") {
    return [
      `基础指标整体完成率${page.metrics[0]?.value || "—"}，自建回款${page.metrics[1]?.value || "—"}，外拓完成率${page.metrics[2]?.value || "—"}。`,
      `${max?.company || "—"}${fmtPct(max?.current)}完成率最高，${min?.company || "—"}${fmtPct(min?.current)}最低，需聚焦低完成率项目回款。`
    ];
  }

  if (page.id === "space") {
    return [
      `空间资源已入账${page.metrics[0]?.value || "—"}，平均完成率${page.metrics[1]?.value || "—"}，当前业绩缺口${page.metrics[2]?.value || "—"}。`,
      `${max?.company || "—"}${fmtPct(max?.current)}完成率最高；重点推进缺口较大公司的签约、入账及续约确认。`
    ];
  }

  return [
    `${page.subtitle}核心指标${summary}${targetPhrase}；${max?.company || "—"}表现领先，${min?.company || "—"}处于低位。`,
    `${improved?.company || "—"}改善最明显，建议结合排名、同比变化和异常明细持续跟进。`
  ];
}

function copyFromPage(page: ReportPage): PageCopy {
  const bullets = page.bullets.length ? page.bullets : generatedBullets(page);
  return {
    mainConclusion: bullets[0],
    keyCompanies: page.keyCompanies.map((item) => `${item.label}：${item.company} ${item.value}`).join("；"),
    reason: bullets[1],
    note: "",
    updatedAt: nowIso(),
    history: []
  };
}

function mentionsExcludedCompany(copy: PageCopy) {
  const text = [copy.mainConclusion, copy.keyCompanies, copy.reason, copy.note].join("\n");
  return Array.from(EXCLUDED_COMPANY_NAMES).some((company) => text.includes(company));
}

function copyNeedsRefresh(page: ReportPage, copy: PageCopy) {
  if (mentionsExcludedCompany(copy)) return true;
  return !(copy.history?.length);
}

function mergeCopy(pages: ReportPage[], prior?: Report | null): Record<PageId, PageCopy> {
  const copy = {} as Record<PageId, PageCopy>;
  for (const page of pages) {
    const existing = prior?.copy?.[page.id];
    copy[page.id] = existing && !copyNeedsRefresh(page, existing) ? existing : copyFromPage(page);
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
  const targets = targetsFromAnalysis(input.files.analysis);
  const current = overallCompanies(input.files.brief, "current");
  const arrears = overallCompanies(input.files.brief, "arrears");
  const currentTargetAverage =
    current.companies.reduce((sum, row) => sum + (targets.get(row.company) || 0), 0) /
    Math.max(current.companies.filter((row) => targets.has(row.company)).length, 1);
  const residentMap = residentHouseholds(input.files.resident);
  const repairScoreSource = scoreDistributionData(input.files.analysis, "入户维修", undefined, `${input.month}月`);
  const complaintScoreSource = scoreDistributionData(input.files.analysis, "投诉评分", residentMap, `${input.month}月`);
  const repairRows = completeCompanyMetrics(
    repairScoreSource.rows.map((row) => ({
      company: row.company,
      current: row.total ?? null,
      previous: row.previousTotal ?? null,
      delta: row.totalDelta ?? null,
      secondary: row.score ?? null,
      target: row.lowShare ?? null,
      amount: row.highShare ?? null
    }))
  );
  const complaintRows = completeCompanyMetrics(
    complaintScoreSource.rows.map((row) => ({
      company: row.company,
      current: row.complaintRate ?? null,
      previous: row.residentHouseholds ?? null,
      amount: row.total ?? null,
      delta: row.complaintRateDelta ?? null,
      secondary: row.score ?? null,
      target: row.scoreDelta ?? null
    }))
  );

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
      data: { splitLeftTitle: "1年以内", splitRightTitle: "2-3年" },
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

  const equipmentSource = equipmentHealthData(input.files.analysis);
  const equipment = equipmentSource.metrics;
  const equipmentTotal = equipmentSource.detailRows.length;
  const equipmentValid = equipmentSource.detailRows.filter(
    (row) => row.inspectionRate != null || row.maintenanceRate != null || row.onsiteFactor != null || row.elevatorFaultRate != null
  ).length;
  const equipmentScore = equipmentSource.summary?.score ?? avg(equipment, "current");
  const equipmentInspection = equipmentSource.summary?.inspectionRate ?? avg(equipment, "previous");
  const equipmentMaintenance = equipmentSource.summary?.maintenanceRate ?? avg(equipment, "delta");
  const equipmentFault = equipmentSource.summary?.elevatorFaultRate ?? avg(equipment, "amount");
  const equipmentTop = topBy(equipment, (row) => row.current);
  const equipmentLow = bottomBy(equipment, (row) => row.current);
  const equipmentWeakest = [
    { label: "巡检完成率", value: equipmentInspection },
    { label: "维保完成率", value: equipmentMaintenance },
    { label: "电梯故障率", value: equipmentFault }
  ]
    .filter((item): item is { label: string; value: number } => typeof item.value === "number")
    .sort((left, right) => left.value - right.value)[0];
  pages.push(
    makePage({
      id: "equipment-health",
      order: 7,
      title: `${input.year}年${input.month}月运营回顾`,
      subtitle: "设施设备健康度",
      chartTitle: "设施设备健康度得分与构成",
      kind: "score-table",
      metrics: [
        metric("集团健康度得分", fmtScore(equipmentScore), Number(equipmentScore || 0) >= 100 ? "green" : Number(equipmentScore || 0) > 0 ? "blue" : "red"),
        metric("巡检完成率", fmtPct(equipmentInspection), Number(equipmentInspection || 0) >= 90 ? "green" : "blue"),
        metric("维保完成率", fmtPct(equipmentMaintenance), Number(equipmentMaintenance || 0) >= 90 ? "green" : "red"),
        metric("电梯故障率", fmtPct(equipmentFault), Number(equipmentFault || 0) >= 95 ? "green" : "blue")
      ],
      keyCompanies: [
        key("得分最高", equipmentTop, fmtScore(equipmentTop?.current), "blue"),
        key("得分最低", equipmentLow, fmtScore(equipmentLow?.current), "red"),
        key("主要短板", { company: equipmentWeakest?.label || "—", current: equipmentWeakest?.value ?? null }, fmtPct(equipmentWeakest?.value), "red")
      ],
      companies: equipment,
      data: { equipmentRows: equipmentSource.detailRows },
      bullets: [
        `${input.year}年${input.month}月设施设备健康度集团得分${fmtScore(equipmentScore)}，巡检完成率${fmtPct(equipmentInspection)}、维保完成率${fmtPct(equipmentMaintenance)}、电梯故障率${fmtPct(equipmentFault)}。`,
        `${equipmentWeakest?.label || "维保完成率"}为当前主要短板，右侧明细按巡检、维保、电梯故障率和健康度得分展示。`
      ],
      sourceIds: sourceForPage("equipment-health")
    })
  );
  sources.push(source("src-equipment-health", "equipment-health", "设施设备健康度", "analysis", input.files.analysis, "设备设施管理", "A1:G16"));
  if (equipmentTotal > 0 && equipmentValid < equipmentTotal) {
    validation.push({
      id: "equipment-health-missing-detail",
      severity: "warning",
      pageId: "equipment-health",
      message: `设施设备健康度有${equipmentTotal - equipmentValid}家公司缺少巡检/维保/电梯故障率明细，已按--展示。`
    });
  }

  const energySource = energyCostData(input.files.analysis);
  const energy = energySource.metrics;
  const energyDetailMissing = energySource.detailRows.filter(
    (row) => row.totalCost25 == null && row.totalCost26 == null && row.income == null && row.cost == null
  ).length;
  const energySum = (selector: (row: EnergyCostRow) => number | null | undefined) => {
    const values = energySource.detailRows
      .map(selector)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return values.length ? values.reduce((total, value) => total + value, 0) : null;
  };
  const energyTotalCost25 = energySource.summary?.totalCost25 ?? energySum((row) => row.totalCost25);
  const energyTotalCost26 = energySource.summary?.totalCost26 ?? energySum((row) => row.totalCost26);
  const energyWaterCost26 = energySource.summary?.waterCost26 ?? energySum((row) => row.waterCost26);
  const energyElectricityCost26 = energySource.summary?.electricityCost26 ?? energySum((row) => row.electricityCost26);
  const energyCostYoY = energySource.summary?.costYoY ?? ratioChange(energyTotalCost26, energyTotalCost25);
  const energyCostTop = topBy(energy, (row) => row.current);
  const energyYoYTop = topBy(energy, (row) => row.delta);
  pages.push(
    makePage({
      id: "energy-cost",
      order: 8,
      title: `${input.year}年${input.month}月运营回顾`,
      subtitle: "自用能耗成本管控",
      chartTitle: "自用能耗成本排名与同比变化",
      kind: "score-table",
      metrics: [
        metric("26年合计成本", fmtAmount(energyTotalCost26), "blue"),
        metric("合计成本同比", fmtPp(energyCostYoY), Number(energyCostYoY || 0) <= 0 ? "green" : "red"),
        metric("26年水费成本", fmtAmount(energyWaterCost26), "blue"),
        metric("26年电费成本", fmtAmount(energyElectricityCost26), "blue")
      ],
      keyCompanies: [
        key("合计成本最高", energyCostTop, fmtAmount(energyCostTop?.current), "red"),
        key("同比升幅最高", energyYoYTop, fmtPp(energyYoYTop?.delta), "red"),
        key("成本同比", { company: "集团", current: energyCostYoY }, fmtPp(energyCostYoY), Number(energyCostYoY || 0) <= 0 ? "green" : "red")
      ],
      companies: energy,
      data: { energyRows: energySource.detailRows, energyCostMode: energySource.mode },
      bullets: [
        `${input.year}年${input.month}月自用能耗26年合计成本${fmtAmount(energyTotalCost26)}，同比变化${fmtPp(energyCostYoY)}。`,
        `本页按26年合计成本和同比升幅排序，便于识别高成本与成本上升压力公司。`
      ],
      sourceIds: sourceForPage("energy-cost")
    })
  );
  sources.push(source("src-energy-cost", "energy-cost", "自用能耗成本管控", "analysis", input.files.analysis, "自用能耗成本", "A2:K16"));
  if (energyDetailMissing > 0) {
    validation.push({
      id: "energy-cost-missing-detail",
      severity: "warning",
      pageId: "energy-cost",
      message: `自用能耗成本有${energyDetailMissing}家公司缺少25/26年水费、电费或合计成本明细，成本排名按--展示。`
    });
  }

  const repairSummary = repairScoreSource.summary;
  const repairTotal = repairSummary?.total ?? sum(repairRows, "current");
  const repairPreviousTotal = repairSummary?.previousTotal ?? sum(repairRows, "previous");
  const repairTotalDelta = repairSummary?.totalDelta ?? ratioChange(repairTotal, repairPreviousTotal);
  const repairScore = repairSummary?.score ?? avg(repairRows, "secondary");
  const repairHighShare = repairSummary?.highShare ?? avg(repairRows, "amount");
  const repairLowShare = repairSummary?.lowShare ?? avg(repairRows, "target");
  pages.push(
    makePage({
      id: "repair",
      order: 9,
      title: `${input.year}年${input.month}月运营回顾`,
      subtitle: "入户维修满意度",
      chartTitle: "报事量与入户维修满意度",
      kind: "dual-table",
      metrics: [
        metric("集团报事量", fmtCount(repairTotal), "blue"),
        metric("报事量同比", fmtPp(repairTotalDelta), Number(repairTotalDelta || 0) <= 0 ? "green" : "red"),
        metric("集团满意度", fmtScore(repairScore), "blue"),
        metric("7-10分占比", fmtPct(repairHighShare), "green")
      ],
      keyCompanies: [
        key("报事量最高", topBy(repairRows, (row) => row.current), fmtCount(topBy(repairRows, (row) => row.current)?.current), "red"),
        key("满意度最低", bottomBy(repairRows, (row) => row.secondary), fmtScore(bottomBy(repairRows, (row) => row.secondary)?.secondary), "red"),
        key("低分占比最高", topBy(repairRows, (row) => row.target), fmtPct(topBy(repairRows, (row) => row.target)?.target), "red")
      ],
      companies: repairRows,
      data: { satisfactionRows: repairScoreSource.rows },
      bullets: [
        `${input.year}年${input.month}月入户维修集团报事量${fmtCount(repairTotal)}，同比${fmtPp(repairTotalDelta)}；满意度${fmtScore(repairScore)}，7-10分占比${fmtPct(repairHighShare)}。`,
        `${topBy(repairRows, (row) => row.current)?.company || "—"}报事量最高，${bottomBy(repairRows, (row) => row.secondary)?.company || "—"}满意度最低，需结合低分占比重点跟进。`
      ],
      sourceIds: sourceForPage("repair")
    })
  );
  sources.push(source("src-repair", "repair", "入户维修满意度", "analysis", input.files.analysis, "入户维修", scoreBlockRange(input.month)));

  const complaintSummary = complaintScoreSource.summary;
  const complaintTotal = complaintSummary?.total ?? sum(complaintRows, "amount");
  const residentTotal = residentMap.get("集团") ?? sum(complaintRows, "previous");
  const complaintGroupRate = residentTotal ? (complaintTotal / residentTotal) * 100 : avg(complaintRows, "current");
  const complaintRateDelta = complaintSummary?.complaintRateDelta ?? avg(complaintRows, "delta");
  const complaintHighShare =
    complaintSummary?.highShare ??
    (() => {
      const values = complaintScoreSource.rows
        .map((row) => row.highShare)
        .filter((value): value is number => typeof value === "number");
      return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
    })();
  pages.push(
    makePage({
      id: "complaints",
      order: 10,
      title: `${input.year}年${input.month}月运营回顾`,
      subtitle: "投诉管理",
      chartTitle: "投诉率与投诉处理满意度",
      kind: "dual-table",
      metrics: [
        metric("集团投诉率", fmtPct(complaintGroupRate), "blue", residentTotal ? `${Math.round(complaintTotal)} / ${Math.round(residentTotal)}户` : undefined),
        metric("投诉率同比", fmtPp(complaintRateDelta), Number(complaintRateDelta || 0) <= 0 ? "green" : "red"),
        metric("处理满意度", fmtScore(complaintSummary?.score ?? avg(complaintRows, "secondary")), "blue"),
        metric("7-10分占比", fmtPct(complaintHighShare), "green")
      ],
      keyCompanies: [
        key("投诉率最高", topBy(complaintRows, (row) => row.current), fmtPct(topBy(complaintRows, (row) => row.current)?.current), "red"),
        key("满意度最低", bottomBy(complaintRows, (row) => row.secondary), fmtScore(bottomBy(complaintRows, (row) => row.secondary)?.secondary), "red"),
        key("低分占比最高", {
          company: [...complaintScoreSource.rows].sort((left, right) => Number(right.lowShare || 0) - Number(left.lowShare || 0))[0]?.company || "--",
          current: [...complaintScoreSource.rows].sort((left, right) => Number(right.lowShare || 0) - Number(left.lowShare || 0))[0]?.lowShare ?? null
        }, fmtPct([...complaintScoreSource.rows].sort((left, right) => Number(right.lowShare || 0) - Number(left.lowShare || 0))[0]?.lowShare), "red")
      ],
      companies: complaintRows,
      data: { satisfactionRows: complaintScoreSource.rows },
      bullets: [
        `${input.year}年${input.month}月集团投诉率${fmtPct(complaintGroupRate)}${residentTotal ? `（投诉${Math.round(complaintTotal)}件，常驻${Math.round(residentTotal)}户）` : ""}，同比${fmtPp(complaintRateDelta)}；处理满意度${fmtScore(complaintSummary?.score ?? avg(complaintRows, "secondary"))}。`,
        `${topBy(complaintRows, (row) => row.current)?.company || "—"}投诉率最高，${bottomBy(complaintRows, (row) => row.secondary)?.company || "—"}满意度最低，需结合低分占比重点跟进。`
      ],
      sourceIds: sourceForPage("complaints")
    })
  );
  sources.push(source("src-complaints", "complaints", "投诉管理", "analysis", input.files.analysis, "投诉评分", "A98:M112"));
  if (input.files.resident) {
    sources.push(source("src-complaints-resident", "complaints", "常驻户数", "resident", input.files.resident, "Sheet1", "A1:B15"));
  }

  const baseInfo = efficiencyData(input.files.analysis, "基础信息抽查", input.month, 95);
  const awareness400 = efficiencyData(input.files.analysis, "400知晓率", input.month, 50);
  pages.push(
    makePage({
      id: "efficiency",
      order: 11,
      title: `${input.year}年${input.month}月运营回顾`,
      subtitle: "效率管理",
      chartTitle: "基础信息维护与400知晓率",
      kind: "efficiency",
      metrics: [
        metric("基础信息准确率", fmtPct(baseInfo.summary?.current ?? avg(baseInfo.rows, "current")), Number(baseInfo.summary?.current || 0) >= 95 ? "green" : "blue", "指标95%"),
        metric("基础信息同比", fmtPp(baseInfo.summary?.delta ?? avg(baseInfo.rows, "delta")), Number(baseInfo.summary?.delta || 0) >= 0 ? "green" : "red"),
        metric("400知晓率", fmtPct(awareness400.summary?.current ?? avg(awareness400.rows, "current")), Number(awareness400.summary?.current || 0) >= 50 ? "green" : "red", "指标50%"),
        metric("400同比", fmtPp(awareness400.summary?.delta ?? avg(awareness400.rows, "delta")), Number(awareness400.summary?.delta || 0) >= 0 ? "green" : "red")
      ],
      keyCompanies: [
        key("基础信息最低", bottomBy(baseInfo.rows, (row) => row.current), fmtPct(bottomBy(baseInfo.rows, (row) => row.current)?.current), "red"),
        key("400知晓率最低", bottomBy(awareness400.rows, (row) => row.current), fmtPct(bottomBy(awareness400.rows, (row) => row.current)?.current), "red"),
        key("400提升最大", topBy(awareness400.rows, (row) => row.delta), fmtPp(topBy(awareness400.rows, (row) => row.delta)?.delta), "green")
      ],
      companies: baseInfo.rows,
      secondaryCompanies: awareness400.rows,
      bullets: [
        `基础信息准确率当前为${fmtPct(baseInfo.summary?.current ?? avg(baseInfo.rows, "current"))}，对照95%指标线识别低于标准公司。`,
        `400知晓率当前为${fmtPct(awareness400.summary?.current ?? avg(awareness400.rows, "current"))}，对照50%指标线跟踪同比变化和后段公司。`
      ],
      sourceIds: sourceForPage("efficiency")
    })
  );
  sources.push(source("src-efficiency", "efficiency", "效率管理", "analysis", input.files.analysis, "基础信息抽查 / 400知晓率", "A1:S16"));

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
      resident: input.files.resident ? path.basename(input.files.resident) : undefined
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
