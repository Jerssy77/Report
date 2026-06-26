import type { PageCopy, ReportPage } from "../../shared/report";
import { BrandLogo, HeaderRibbon } from "./Brand";
import { SlideBody } from "./SlideLayouts";

interface SlideCanvasProps {
  page: ReportPage;
  copy: PageCopy;
  updatedAt: string;
  exportMode?: boolean;
}

export function SlideCanvas({ page, copy, updatedAt, exportMode = false }: SlideCanvasProps) {
  return (
    <section className={`slide-frame ${exportMode ? "slide-export" : ""}`} data-page-id={page.id}>
      <header className="slide-header">
        <HeaderRibbon />
        <div className="slide-title-group">
          <h1>运营回顾</h1>
          <span>——{page.subtitle}</span>
        </div>
        <BrandLogo />
      </header>
      <div className="slide-rule" />

      <SlideBody page={page} copy={copy} />

      <footer className="slide-footer">
        <span>注：指标以上传 Excel 缓存结果为准，平台不重算复杂公式</span>
        <span>数据来源：运营管理系统　|　更新时间：{updatedAt.slice(0, 10)}</span>
      </footer>
    </section>
  );
}
