# Design QA: Space Resource Preview

## Reference and implementation

- Reference: `C:/Users/jerse/AppData/Local/Temp/codex-clipboard-826f4384-6782-4cea-86c6-a28223d331ab.png`
- Implementation capture: `C:/Users/jerse/Documents/月报/monthly-report-platform/qa-space-preview-fixed.png`
- Combined comparison: `C:/Users/jerse/Documents/月报/monthly-report-platform/qa-space-comparison.png`
- Browser viewport: 1720 x 1200
- Report state: 2026-06, page 06 (space resources)
- Preview mode: fixed 1920 x 1080 slide scaled uniformly to the available width

## Full-view comparison

The combined comparison places the reference and implementation at the same
1263 x 710 display size. The title area, brand asset, KPI strip, stacked bars,
conclusion block, and footer keep the same proportions and vertical rhythm.

## Focused checks

- Summary band: five aligned sections, matching separators, arrow spacing, and
  blue emphasis values.
- Stacked chart: 13 rows fit within the same chart height, with matching label,
  percentage, gap, and legend columns.
- Typography: Microsoft YaHei remains legible after uniform scaling and no
  longer reflows independently at narrow preview widths.
- Spacing: the preview preserves the 1920 x 1080 slide coordinates instead of
  recomputing element widths inside a 1220 px responsive canvas.
- Colors and assets: source logo and the established blue/white report palette
  are unchanged.
- Copy: data values differ from the reference capture because the current June
  report data has been refreshed; layout and information hierarchy match.

## Comparison history

1. Earlier preview: the slide itself shrank to the container width, causing
   text, bars, and gaps to be laid out differently from export.
2. Fix: render a fixed 1920 x 1080 slide and scale the complete canvas with a
   single transform.
3. Post-fix evidence: the same-size side-by-side capture shows matching layout
   density and structure across the full page and the chart region.

## Repair satisfaction redesign

- Source visual truth: `C:/Users/jerse/AppData/Local/Temp/codex-clipboard-a3cc7ced-8885-4a88-b576-e7689ab799f4.png`
- Implementation screenshot: `C:/Users/jerse/Documents/月报/monthly-report-platform/qa-repair-slide-final.png`
- Full comparison: `C:/Users/jerse/Documents/月报/monthly-report-platform/qa-repair-comparison.png`
- Focused comparison: `C:/Users/jerse/Documents/月报/monthly-report-platform/qa-repair-left-comparison.png`
- Browser viewport: 1720 x 1200
- State: 2026-06, page 09 (repair satisfaction)
- Primary interaction: opened the report and selected page 09 from the page navigation.

### Findings and comparison history

1. Initial implementation matched the complaint-management two-column structure,
   but four-digit volume labels extended into the comparison column (P2).
2. Fix: report volumes now use integer formatting and a fixed right-aligned value
   slot inside the bar column.
3. Post-fix evidence: the focused comparison shows separate, readable columns for
   company, report volume, period change, and satisfaction, including the group row.
4. No remaining P0/P1/P2 findings. The left table, right satisfaction distribution,
   conclusion area, logo, header, and footer follow the reference structure.

### Required fidelity surfaces

- Typography: Microsoft YaHei hierarchy and chart-label sizing remain consistent.
- Layout rhythm: the 52/48 two-column grid, 14-row table, conclusion block, and
  footer align with the complaint-management reference.
- Colors: blue bars, red/green period-change semantics, and risk outlines match.
- Assets: the original Century Golden Resources Service logo is unchanged and sharp.
- Copy: repair-specific labels and conclusions replace complaint-specific language;
  data is sourced from the June analysis workbook.

## Complaint and repair readability pass

- Source visual truth: `C:/Users/jerse/AppData/Local/Temp/codex-clipboard-5362c02c-4ee0-4de6-9bdd-4df0a85f0e71.png`
- Complaint implementation: `C:/Users/jerse/Documents/月报/monthly-report-platform/qa-complaints-readable.png`
- Repair implementation: `C:/Users/jerse/Documents/月报/monthly-report-platform/qa-repair-readable.png`
- Full comparison: `C:/Users/jerse/Documents/月报/monthly-report-platform/qa-readability-comparison.png`
- Risk-box comparison: `C:/Users/jerse/Documents/月报/monthly-report-platform/qa-red-box-comparison.png`
- State: 2026-06, pages 09 and 10, fixed 1920 x 1080 slide scaled in the desktop preview.

### Findings and comparison history

1. Earlier capture: dense chart labels were too small at the default scaled preview
   size (P1), especially company names, deltas, satisfaction values, and headers.
2. Earlier capture: left-table risk labels used dashed borders while right-chart
   risk labels used solid borders with different padding and radius (P2).
3. Fix: complaint-style pages now use larger chart titles, headers, row labels,
   values, bars, and satisfaction labels while preserving all 14 rows.
4. Fix: both risk-label variants now share one compact red dashed-border rule,
   including identical padding, radius, line height, and centered alignment.
5. Post-fix evidence: the full and focused comparisons show improved text scale,
   no row or label overflow, and consistent small dashed boxes on both sides.

### Required fidelity surfaces

- Typography: chart text is raised to a readable 0.92-1.02 cqw range; titles use
  1.28 cqw and retain Microsoft YaHei.
- Layout rhythm: the two-column grid, row count, bar lengths, and conclusion area
  remain unchanged; larger text does not cause wrapping or overlap.
- Colors: semantic red/green deltas and the established blue chart palette remain.
- Assets: the supplied brand logo and header treatment are unchanged.
- Copy: complaint and repair terminology, values, and conclusions remain source-backed.

## Company alignment and fee-rate sorting pass

- State: 2026-06, pages 01-04 and 09-10, desktop preview at 1720 x 1200.
- Interaction: selected each report page from the page navigation and inspected the rendered chart order and company-label geometry.

### Findings and verification

1. Fee-rate pages 01-04 now sort every chart independently by year-over-year
   change from highest to lowest. Browser evidence confirmed monotonic descending
   deltas on both overview pages and on both columns of each split page.
2. Complaint and repair company labels now reserve identical transparent border
   and padding space in normal rows. Risk rows only change border color/style to
   the compact red dashed treatment, so the text never shifts horizontally.
3. Geometry verification found one shared x position for every company name in
   each column: 63.23 px on the left and 709.94 px on the right at the QA viewport.
4. Visual inspection confirmed the existing two-column layout, typography,
   bar lengths, conclusion area, header, logo, and footer remain unchanged.

## Fee-rate project split data correction

- Source workbook: `data/reports/2026-06/source/brief.xlsx`
- Current fee source: `当期-费项`, self-built block `A1:AG21`, external block `A24:AG44`.
- Arrears source: `历欠-账龄`, self-built block `A1:AI21`, external block `A24:AI44`.
- The displayed values now come from each block's rightmost `合计` columns:
  current rate, prior-year rate, and year-over-year rate change.

### Verification

1. Current fee page: self-built total 83.1%, external total 61.2%; both charts contain 13 companies.
2. Arrears page: self-built total 29.4%, external total 17.5%; both charts contain 13 companies.
3. Browser verification confirmed page 02 and page 04 headings are `自建项目` and `外拓项目`, and all chart values remain sorted by year-over-year change.
4. May and June workbooks both parse without validation errors. Missing self-built/external blocks or totals now create blocking validation errors instead of silently displaying the wrong fee category.

## Current fee overview combined-source correction

- Primary June source: `当期-费项 A47:AG67`, the `当期收费简报-合计` block combining self-built and external projects.
- Historical compatibility: when an older workbook has no combined block, the platform combines the self-built and external receivable/paid totals before deriving the rates.

### Verification

1. June group current fee rate is 77.4%, year-over-year change is -1.3%, and target completion is 87.2%.
2. June company reconciliation includes Beijing 81.9% / -1.2%, Beicheng 75.6% / -4.5%, and Ningbo 74.5% / -5.3%.
3. Page 01 contains all 13 companies and its source trace points to `当期-费项 A47:AG67`.
4. May and June both build without validation errors; a missing combined source now blocks export instead of reverting to the unrelated `整体` table.

## Arrears overview combined-source correction

- Primary June source: `历欠-账龄 A47:AJ67`, the `历欠收费简报-合计` block combining self-built and external projects.
- Historical compatibility: May has no cached combined block, so the platform combines `A1:AJ43` self-built and external receivable/paid totals before deriving rates.

### Verification

1. June group arrears fee rate is 25.3%, year-over-year change is -2.1%, and collected amount is 7,665万.
2. June company reconciliation includes Beijing 15.4% / -5.3%, Beicheng 26.5% / +2.1%, and Ningbo 27.5% / -1.9%.
3. Page 03 contains all 13 companies and its source trace points to `历欠-账龄 A47:AJ67` for June.
4. May and June both build without validation errors; missing combined and split sources now block export rather than falling back to the unrelated `整体` table.

final result: passed
