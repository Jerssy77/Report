# 月度运营数据展示平台

本地 Web 月报工具：上传固定模板 Excel，生成 9 页 16:9 运营回顾版面，支持规则生成结论文案、人工修订、预览确认，并一键导出快照版 PDF 和截图型 PPTX。

视觉和页面结构以 `数据展示（去年）.pptx` 的 9 页业务页为基准，采用蓝白企业汇报风格，并使用 `世纪金源品牌logo.png` 对应的本地品牌 logo。

## 快速启动

```powershell
cd C:\Users\jerse\Documents\月报\monthly-report-platform
pnpm install
pnpm build
pnpm start
```

访问：

```text
http://127.0.0.1:4120/
```

开发模式：

```powershell
pnpm dev
```

类型检查：

```powershell
pnpm check
```

## 使用流程

1. 打开页面后选择年份和月份。
2. 点击“载入当前5月样例”，可读取仓库根目录下的两份 Excel，并生成补充数据样例。
3. 后续每月上传三个固定文件：数据分析 Excel、经营简报 Excel、补充数据 Excel。
4. 在右侧编辑“主结论、重点公司、原因说明、补充备注”。
5. 点击“导出PDF+PPTX”，系统按快照模式生成 9 页 PDF 和 PPTX。

## 数据和导出

运行数据按报告期归档：

```text
data/reports/YYYY-MM/
```

其中包含源 Excel、解析后的 `report.json`、导出版本和页面截图。该目录默认不进 Git，避免把大量导出文件和运行缓存误推上云。

补充数据模板可在页面中点击“下载补充数据模板”获取。

## 换电脑继续

新电脑打开项目后，请先阅读：

```text
HANDOFF.md
```

然后运行 `pnpm install && pnpm build && pnpm start`。如果需要恢复当前 2026 年 5 月的运行状态，可在页面里点击“载入当前5月样例”重新生成报告。
