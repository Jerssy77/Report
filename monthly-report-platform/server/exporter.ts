import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import pptxgenjs from "pptxgenjs";
import { chromium } from "playwright-core";
import type { Report, ReportExport } from "../shared/report.js";
import { DATA_ROOT, SERVER_PORT } from "./constants.js";
import { exportDir, writeReport } from "./storage.js";

function exportId() {
  const date = new Date();
  const stamp = date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "");
  return stamp;
}

async function launchBrowser() {
  const channels = [process.env.BROWSER_CHANNEL, "msedge", "chrome"].filter(Boolean) as string[];
  let lastError: unknown;
  for (const channel of channels) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `无法启动 Edge/Chrome 进行快照导出。请确认本机已安装 Microsoft Edge 或 Chrome。最后错误：${String(
      lastError
    )}`
  );
}

function frontendOrigin() {
  return process.env.APP_ORIGIN || `http://127.0.0.1:${SERVER_PORT}`;
}

async function writePdf(imagePaths: string[], pdfPath: string) {
  const pdf = await PDFDocument.create();
  for (const imagePath of imagePaths) {
    const bytes = await fs.readFile(imagePath);
    const image = await pdf.embedPng(bytes);
    const page = pdf.addPage([1920, 1080]);
    page.drawImage(image, { x: 0, y: 0, width: 1920, height: 1080 });
  }
  await fs.writeFile(pdfPath, await pdf.save());
}

async function writePptx(imagePaths: string[], pptxPath: string) {
  const PptxGen = pptxgenjs as unknown as new () => {
    layout: string;
    author: string;
    subject: string;
    title: string;
    addSlide: () => {
      background: { color: string };
      addImage: (options: { path: string; x: number; y: number; w: number; h: number }) => void;
    };
    writeFile: (options: { fileName: string }) => Promise<unknown>;
  };
  const pptx = new PptxGen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "月度运营数据展示平台";
  pptx.subject = "运营月报快照";
  pptx.title = "运营月报快照";
  for (const imagePath of imagePaths) {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addImage({ path: imagePath, x: 0, y: 0, w: 13.333, h: 7.5 });
  }
  await pptx.writeFile({ fileName: pptxPath });
}

export function fileUrl(absPath: string) {
  const relative = path.relative(DATA_ROOT, absPath).replaceAll(path.sep, "/");
  return `/files/${relative}`;
}

export async function exportReport(report: Report): Promise<Report> {
  const errors = report.validation.filter((issue) => issue.severity === "error");
  if (errors.length) {
    throw new Error(`存在${errors.length}个关键数据问题，已阻止导出。`);
  }

  const id = exportId();
  const dir = exportDir(report.period, id);
  const pagesDir = path.join(dir, "pages");
  await fs.mkdir(pagesDir, { recursive: true });

  const browser = await launchBrowser();
  const imagePaths: string[] = [];
  try {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2
    });
    const url = `${frontendOrigin()}/?period=${encodeURIComponent(report.period)}&export=1`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForSelector(".slide-export", { timeout: 120000 });
    const slides = page.locator(".slide-export");
    const count = await slides.count();
    for (let index = 0; index < count; index += 1) {
      const imagePath = path.join(pagesDir, `page-${String(index + 1).padStart(2, "0")}.png`);
      await slides.nth(index).screenshot({ path: imagePath, type: "png" });
      imagePaths.push(imagePath);
    }
  } finally {
    await browser.close();
  }

  const pdfPath = path.join(dir, `${report.period}-运营月报.pdf`);
  const pptxPath = path.join(dir, `${report.period}-运营月报.pptx`);
  await writePdf(imagePaths, pdfPath);
  await writePptx(imagePaths, pptxPath);

  const item: ReportExport = {
    id,
    createdAt: new Date().toISOString(),
    pdfPath,
    pptxPath,
    imagePaths
  };
  const next: Report = {
    ...report,
    updatedAt: new Date().toISOString(),
    exports: [item, ...report.exports]
  };
  await writeReport(next);
  return next;
}
