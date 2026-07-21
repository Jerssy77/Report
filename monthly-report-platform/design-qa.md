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

final result: passed
