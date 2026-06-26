import path from "node:path";

export const SERVER_PORT = Number(process.env.PORT || 4120);
export const DEV_FRONTEND_ORIGIN = process.env.APP_ORIGIN || "http://127.0.0.1:5173";

export const APP_ROOT = process.cwd();
export const DATA_ROOT = path.join(APP_ROOT, "data");
export const REPORTS_ROOT = path.join(DATA_ROOT, "reports");
export const TEMPLATE_ROOT = path.join(DATA_ROOT, "templates");
export const SOURCE_ROOT = path.resolve(APP_ROOT, "..");

export const STANDARD_COMPANY_ORDER = [
  "北京",
  "贵阳",
  "昆明",
  "滨湖",
  "长沙",
  "闽江",
  "北城",
  "罗源",
  "连江",
  "宁波",
  "腾冲",
  "版纳",
  "阜阳",
  "广州"
];

export const SUMMARY_NAMES = new Set(["小计", "合计", "集团", "总计"]);
