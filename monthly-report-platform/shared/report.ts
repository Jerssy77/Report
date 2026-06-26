export type PageId =
  | "current-overview"
  | "current-split"
  | "arrears-overview"
  | "arrears-split"
  | "clearance"
  | "space"
  | "charging"
  | "repair"
  | "complaints";

export type ReportFileKind = "analysis" | "brief" | "supplement";

export interface SourceTrace {
  id: string;
  pageId?: PageId;
  label: string;
  fileKind: ReportFileKind | "system";
  fileName: string;
  sheet?: string;
  range?: string;
  updatedAt: string;
}

export interface ValidationIssue {
  id: string;
  severity: "error" | "warning" | "info";
  pageId?: PageId;
  message: string;
  field?: string;
}

export interface CompanyMetric {
  company: string;
  current: number | null;
  previous?: number | null;
  target?: number | null;
  delta?: number | null;
  amount?: number | null;
  secondary?: number | null;
  category?: string;
}

export interface ClearanceRow {
  company: string;
  selfTotal: number | null;
  selfTarget: number | null;
  selfCollected: number | null;
  selfRate: number | null;
  externalTotal: number | null;
  externalTarget: number | null;
  externalCollected: number | null;
  externalRate: number | null;
}

export interface SpaceResourceRow {
  company: string;
  lastYear: number | null;
  budget: number | null;
  target: number | null;
  booked: number | null;
  bookedYoY: number | null;
  pendingBooked: number | null;
  pendingRenewal: number | null;
  forecast: number | null;
  gap: number | null;
  previousGap: number | null;
  newAmount: number | null;
  remark?: string;
}

export interface PageDataBlocks {
  clearanceRows?: ClearanceRow[];
  spaceRows?: SpaceResourceRow[];
  splitLeftTitle?: string;
  splitRightTitle?: string;
}

export interface SummaryMetric {
  label: string;
  value: string;
  tone?: "blue" | "red" | "green" | "neutral";
  sublabel?: string;
}

export interface KeyCompany {
  label: string;
  company: string;
  value: string;
  tone?: "blue" | "red" | "green";
}

export interface PageCopy {
  mainConclusion: string;
  keyCompanies: string;
  reason: string;
  note: string;
  updatedAt?: string;
  history?: Array<{
    at: string;
    fields: Omit<PageCopy, "history">;
  }>;
}

export interface ReportPage {
  id: PageId;
  order: number;
  title: string;
  subtitle: string;
  chartTitle: string;
  templateSlide: number;
  layout:
    | "overview-bars"
    | "split-two-charts"
    | "clearance-table"
    | "space-progress"
    | "charging-dashboard"
    | "repair-dashboard"
    | "complaints-dashboard";
  kind:
    | "bar-compare"
    | "split-bars"
    | "clearance"
    | "space"
    | "quadrant"
    | "dual-table";
  metrics: SummaryMetric[];
  keyCompanies: KeyCompany[];
  companies: CompanyMetric[];
  secondaryCompanies?: CompanyMetric[];
  data?: PageDataBlocks;
  tableRows?: Array<Record<string, string | number>>;
  bullets: string[];
  sourceIds: string[];
}

export interface ReportExport {
  id: string;
  createdAt: string;
  pdfPath: string;
  pptxPath: string;
  imagePaths: string[];
}

export interface Report {
  period: string;
  year: number;
  month: number;
  createdAt: string;
  updatedAt: string;
  files: Partial<Record<ReportFileKind, string>>;
  pages: ReportPage[];
  copy: Record<PageId, PageCopy>;
  validation: ValidationIssue[];
  sources: SourceTrace[];
  exports: ReportExport[];
}

export interface ReportListItem {
  period: string;
  year: number;
  month: number;
  updatedAt: string;
  validationErrors: number;
  exports: number;
}

export const PPT_LAYOUT_MAP: Record<PageId, Pick<ReportPage, "templateSlide" | "layout"> & { role: string }> = {
  "current-overview": { templateSlide: 1, layout: "overview-bars", role: "当期收费率综合对比" },
  "current-split": { templateSlide: 2, layout: "split-two-charts", role: "当期收费率自建/外拓拆分" },
  "arrears-overview": { templateSlide: 3, layout: "overview-bars", role: "历欠收费率综合对比" },
  "arrears-split": { templateSlide: 4, layout: "split-two-charts", role: "历欠账龄拆分" },
  clearance: { templateSlide: 5, layout: "clearance-table", role: "清欠专项活动" },
  space: { templateSlide: 6, layout: "space-progress", role: "空间资源年度/季度进度" },
  charging: { templateSlide: 7, layout: "charging-dashboard", role: "充电桩经营分析" },
  repair: { templateSlide: 8, layout: "repair-dashboard", role: "入户维修满意度" },
  complaints: { templateSlide: 9, layout: "complaints-dashboard", role: "投诉管理" }
};

export const PAGE_ORDER: Array<{ id: PageId; title: string; subtitle: string }> = [
  { id: "current-overview", title: "当期收费率", subtitle: "当期收费率" },
  { id: "current-split", title: "当期收费率拆分", subtitle: "当期收费率" },
  { id: "arrears-overview", title: "历欠收费率", subtitle: "历欠收费率" },
  { id: "arrears-split", title: "历欠收费率拆分", subtitle: "历欠收费率" },
  { id: "clearance", title: "清欠专项活动", subtitle: "清欠专项活动" },
  { id: "space", title: "空间资源", subtitle: "空间资源" },
  { id: "charging", title: "充电桩", subtitle: "充电桩" },
  { id: "repair", title: "入户维修满意度", subtitle: "入户维修满意度" },
  { id: "complaints", title: "投诉管理", subtitle: "投诉管理" }
];
