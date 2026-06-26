import XLSX from "xlsx";
import type { CompanyMetric } from "../shared/report.js";

export interface SupplementData {
  charging: {
    summary: Record<string, number>;
    rows: CompanyMetric[];
  };
  repair: CompanyMetric[];
  complaints: CompanyMetric[];
}

export const SAMPLE_SUPPLEMENT: SupplementData = {
  charging: {
    summary: {
      income: 1466,
      incomeYoY: 2,
      grossProfit: 736,
      profitRate: 51
    },
    rows: [
      { company: "北城", current: 31, secondary: 27, target: 73, delta: -4 },
      { company: "滨湖", current: 42, secondary: 31, target: 69, delta: 8 },
      { company: "阜阳", current: 52, secondary: 10, target: 90, delta: 84 },
      { company: "宁波", current: 44, secondary: 44, target: 56, delta: 41 },
      { company: "长沙", current: 43, secondary: 9, target: 91, delta: 27 },
      { company: "贵阳", current: 40, secondary: 20, target: 80, delta: 16 },
      { company: "昆明", current: 37, secondary: 5, target: 95, delta: 8 },
      { company: "罗源", current: 41, secondary: 56, target: 44, delta: -8 }
    ]
  },
  repair: [
    { company: "阜阳", current: 99.0, delta: 0.2, secondary: 87.2 },
    { company: "北城", current: 98.5, delta: 0.5, secondary: 86.4 },
    { company: "北京", current: 98.2, delta: 0.4, secondary: 87.6 },
    { company: "贵阳", current: 98.2, delta: 0.9, secondary: 99.0 },
    { company: "宁波", current: 98.1, delta: 0.8, secondary: 93.0 },
    { company: "罗源", current: 98.0, delta: 1.4, secondary: 85.2 },
    { company: "长沙", current: 97.8, delta: -0.3, secondary: 76.5 },
    { company: "滨湖", current: 96.4, delta: -0.9, secondary: 76.8 },
    { company: "版纳", current: 96.0, delta: 0.3, secondary: 97.7 }
  ],
  complaints: [
    { company: "版纳", current: 12.6, delta: 0.49, secondary: 64.6, target: -1.62 },
    { company: "连江", current: 25.7, delta: 3.57, secondary: 58.6, target: 8.40 },
    { company: "阜阳", current: 21.7, delta: 2.90, secondary: 51.7, target: -2.02 },
    { company: "北京", current: 15.2, delta: -0.72, secondary: 77.7, target: 1.03 },
    { company: "腾冲", current: 14.9, delta: 1.40, secondary: 70.3, target: 4.02 },
    { company: "宁波", current: 15.1, delta: 0.96, secondary: 71.7, target: 1.91 },
    { company: "长沙", current: 13.4, delta: 0.03, secondary: 78.9, target: 8.06 },
    { company: "贵阳", current: 7.4, delta: -1.10, secondary: 76.8, target: 9.05 },
    { company: "闽江", current: 5.3, delta: 0.11, secondary: 73.1, target: 6.91 }
  ]
};

export function createSupplementWorkbookBuffer() {
  const wb = XLSX.utils.book_new();
  const chargingRows = [
    ["公司", "综合利润率", "自营端口占比", "联营端口占比", "收入同比pp"],
    ...SAMPLE_SUPPLEMENT.charging.rows.map((row) => [
      row.company,
      row.current,
      row.secondary,
      row.target,
      row.delta
    ])
  ];
  const repairRows = [
    ["公司", "满意度", "同比pp", "及时响应率"],
    ...SAMPLE_SUPPLEMENT.repair.map((row) => [row.company, row.current, row.delta, row.secondary])
  ];
  const complaintRows = [
    ["公司", "投诉率", "投诉率同比pp", "投诉处理满意度", "满意度同比pp"],
    ...SAMPLE_SUPPLEMENT.complaints.map((row) => [
      row.company,
      row.current,
      row.delta,
      row.secondary,
      row.target
    ])
  ];
  const summaryRows = [
    ["指标", "值"],
    ["充电桩收入万元", SAMPLE_SUPPLEMENT.charging.summary.income],
    ["充电桩收入同比", SAMPLE_SUPPLEMENT.charging.summary.incomeYoY],
    ["充电桩毛利额万元", SAMPLE_SUPPLEMENT.charging.summary.grossProfit],
    ["充电桩利润率", SAMPLE_SUPPLEMENT.charging.summary.profitRate]
  ];

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "汇总");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(chargingRows), "充电桩");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(repairRows), "入户维修");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(complaintRows), "投诉管理");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace("%", ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function rowsFromSheet(workbook: XLSX.WorkBook, sheetName: string) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
}

export function parseSupplementWorkbook(filePath?: string): SupplementData {
  if (!filePath) return SAMPLE_SUPPLEMENT;
  const wb = XLSX.readFile(filePath, { cellDates: false, cellFormula: true });
  const summary = { ...SAMPLE_SUPPLEMENT.charging.summary };
  for (const row of rowsFromSheet(wb, "汇总").slice(1)) {
    const key = String(row[0] ?? "");
    const value = asNumber(row[1]);
    if (value == null) continue;
    if (key.includes("收入万元")) summary.income = value;
    if (key.includes("收入同比")) summary.incomeYoY = value;
    if (key.includes("毛利")) summary.grossProfit = value;
    if (key.includes("利润率")) summary.profitRate = value;
  }

  const charging = rowsFromSheet(wb, "充电桩")
    .slice(1)
    .map((row) => ({
      company: String(row[0] ?? ""),
      current: asNumber(row[1]),
      secondary: asNumber(row[2]),
      target: asNumber(row[3]),
      delta: asNumber(row[4])
    }))
    .filter((row) => row.company);

  const repair = rowsFromSheet(wb, "入户维修")
    .slice(1)
    .map((row) => ({
      company: String(row[0] ?? ""),
      current: asNumber(row[1]),
      delta: asNumber(row[2]),
      secondary: asNumber(row[3])
    }))
    .filter((row) => row.company);

  const complaints = rowsFromSheet(wb, "投诉管理")
    .slice(1)
    .map((row) => ({
      company: String(row[0] ?? ""),
      current: asNumber(row[1]),
      delta: asNumber(row[2]),
      secondary: asNumber(row[3]),
      target: asNumber(row[4])
    }))
    .filter((row) => row.company);

  return {
    charging: { summary, rows: charging.length ? charging : SAMPLE_SUPPLEMENT.charging.rows },
    repair: repair.length ? repair : SAMPLE_SUPPLEMENT.repair,
    complaints: complaints.length ? complaints : SAMPLE_SUPPLEMENT.complaints
  };
}
