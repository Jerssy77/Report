import { BarChart3 } from "lucide-react";

export function HeaderRibbon() {
  return <div className="header-ribbon" aria-hidden="true" />;
}

export function BrandLogo() {
  return (
    <div className="brand-logo" aria-label="世纪金源服务">
      <img src={`${import.meta.env.BASE_URL || "/"}brand-logo.png`} alt="世纪金源服务" />
    </div>
  );
}

export function SummaryIcon() {
  return (
    <div className="summary-icon" aria-hidden="true">
      <BarChart3 size={48} strokeWidth={2.7} />
    </div>
  );
}
