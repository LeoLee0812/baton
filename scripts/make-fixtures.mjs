// 生成集成测试要用的**真实**文档 fixture：一份有文字层的 PDF、一份空白 PDF（模拟扫描件）、
// 一份 docx、一份 xlsx。
// ⚠️ 解析测试必须真喂文件（02-TDD规程 §3 明确不许 mock 解析），所以这些 fixture 必须是真格式。
// 用法：node scripts/make-fixtures.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";

const DIR = join(process.cwd(), "tests/fixtures");
mkdirSync(DIR, { recursive: true });

// ---------- PDF ----------
// 手写一份最小可用的 PDF 1.4：每页一个内容流，用 Helvetica 写 ASCII 文本。
// 之所以不用第三方库：装 pdf-lib 只为造 fixture 不值当，而且手写的结构更可控。
function buildPdf(pages) {
  const objs = [];
  const push = (s) => objs.push(s);

  const pageCount = pages.length;
  const kids = [];
  // 对象编号：1=Catalog 2=Pages 3=Font，然后每页两个对象（Page, Contents）
  for (let i = 0; i < pageCount; i++) kids.push(`${4 + i * 2} 0 R`);

  push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  push(
    `2 0 obj\n<< /Type /Pages /Count ${pageCount} /Kids [${kids.join(" ")}] >>\nendobj\n`,
  );
  push(
    `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
  );

  pages.forEach((lines, i) => {
    const pageObj = 4 + i * 2;
    const contentObj = pageObj + 1;
    push(
      `${pageObj} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObj} 0 R >>\nendobj\n`,
    );
    const body =
      lines.length === 0
        ? ""
        : `BT /F1 12 Tf 60 760 Td 16 TL\n` +
          lines.map((l) => `(${l.replace(/[()\\]/g, "\\$&")}) Tj T*`).join("\n") +
          `\nET`;
    push(`${contentObj} 0 obj\n<< /Length ${body.length} >>\nstream\n${body}\nendstream\nendobj\n`);
  });

  let out = "%PDF-1.4\n";
  const offsets = [0];
  for (const o of objs) {
    offsets.push(out.length);
    out += o;
  }
  const xrefPos = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) {
    out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

// 有文字层的三页 PDF。刻意把可辨识的关键词放在第 2 页，
// 检索测试就靠它验证「搜出来的出处确实是第 2 页」。
writeFileSync(
  join(DIR, "sample.pdf"),
  buildPdf([
    [
      "BATON FIXTURE PDF - PAGE 1",
      "This page is filler so that page 2 is not the first page.",
      "Quotation framework overview and general terms of the agreement.",
      "All prices below are tax inclusive at a rate of thirteen percent.",
      "The buyer shall confirm each order in writing before shipment.",
    ],
    [
      "BATON FIXTURE PDF - PAGE 2",
      "Customer code: HONGYUAN-JIANCAI-2026",
      "Composite flooring annual framework price: 186 CNY per square meter.",
      "Payment term for this customer is net sixty days, an approved exception.",
      "Delivery lead time must include a five day buffer.",
    ],
    [
      "BATON FIXTURE PDF - PAGE 3",
      "Appendix: contact list and escalation path.",
      "Any dispute shall be resolved at the seller local court.",
      "This document is fictional and used only for automated tests.",
    ],
  ]),
);

// 「扫描件」：三页都没有文字层（内容流为空）→ 提取出来几乎是空的
writeFileSync(join(DIR, "scanned.pdf"), buildPdf([[], [], []]));

// ---------- docx ----------
// .docx = 一个 ZIP，里面三个必需部件。用 jszip 造，store 也行、deflate 也行。
async function buildDocx(paragraphs) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.folder("_rels").file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  const body = paragraphs
    .map((p) => {
      const style = p.heading ? `<w:pPr><w:pStyle w:val="Heading${p.heading}"/></w:pPr>` : "";
      const text = p.text.replace(/[<>&]/g, (c) =>
        c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;",
      );
      return `<w:p>${style}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
    })
    .join("");
  zip.folder("word").file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

// ---------- xlsx ----------
async function buildXlsx() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("报价明细");
  ws.addRow(["产品", "规格", "年框价(元)", "备注"]);
  ws.addRow(["复合地板", "橡木纹 12mm", 186, "满 800 平再让 3 个点"]);
  ws.addRow(["实木多层地板", "15mm", 312, "交期 20 个工作日"]);
  ws.addRow(["踢脚线", "同色 80mm", 18, "随主材同批发货"]);
  ws.addRow(["地板胶", "环保 E0 级", 45, "每 100 平约 3 桶"]);
  ws.addRow(["安装人工", "含基层找平", 28, "自流平另计 22"]);
  const ws2 = wb.addWorksheet("客户");
  ws2.addRow(["客户", "账期"]);
  ws2.addRow(["宏远建材", "月结 60 天"]);
  return wb.xlsx.writeBuffer();
}

const docx = await buildDocx([
  { text: "第1章 总则", heading: 1 },
  { text: "1.1 合同主体", heading: 2 },
  { text: "甲方为宏远建材有限公司，乙方为本公司。双方就 2026 年度地板类产品采购达成本框架协议。" },
  { text: "第2章 价格与结算", heading: 1 },
  { text: "2.1 价格条款", heading: 2 },
  { text: "价格执行乙方年度供货报价单所列年框价，协议期内锁定。原材料涨幅超过百分之八时可协商调整。" },
  { text: "2.3 付款方式", heading: 2 },
  { text: "付款方式为月结六十天，甲方于每月二十五日前完成上月对账。逾期付款按日万分之五计违约金。" },
]);
writeFileSync(join(DIR, "sample.docx"), docx);
writeFileSync(join(DIR, "sample.xlsx"), Buffer.from(await buildXlsx()));
writeFileSync(
  join(DIR, "sample.md"),
  `# 采购流程手册

## 第 1 节 请购

所有请购必须先在系统里提请购单，单笔 5 万以下由采购主管审批。

## 第 2 节 询比价

单笔 10 万以上必须三家比价，比价记录要留档两年。
`,
);

console.log("fixture 已生成：sample.pdf / scanned.pdf / sample.docx / sample.xlsx / sample.md");
