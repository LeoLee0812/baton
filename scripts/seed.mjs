// 种子数据：三个员工 + 5 份虚构文档（真切片入库）+ 18 条记忆条目。
// ⚠️ 全部虚构，⛔ 不含任何真实公司/人名。
// 幂等：靠 employee_code / original_filename 判断是否已存在，重复跑不会产生重复数据。
// 用法：npm run seed
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_KEY;
if (!url || !key) {
  console.error("缺少 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_KEY");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFEFF\u200B-\u200D]/g;
const norm = (s) =>
  s
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ")
    .replace(CONTROL, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const EMPLOYEES = [
  {
    employee_code: "wang",
    display_name: "王销售",
    avatar_emoji: "🧑‍💼",
    title: "华东区销售经理",
    department: "销售部",
    status: "active",
  },
  {
    employee_code: "li",
    display_name: "李销售",
    avatar_emoji: "👩‍💼",
    title: "华东区销售",
    department: "销售部",
    status: "active",
  },
  {
    // 刻意保持 0 文件 0 条目：既是「新人入职第一天」的真实状态，
    // 也是 E2E 验证「空态而不是白屏」的稳定对照组（⛔ 不要给他造数据）
    employee_code: "qian",
    display_name: "钱新人",
    avatar_emoji: "🧑‍🎓",
    title: "销售助理（新入职）",
    department: "销售部",
    status: "active",
  },
  {
    employee_code: "zhao",
    display_name: "赵采购",
    avatar_emoji: "🧑‍🔧",
    title: "采购主管",
    department: "采购部",
    status: "active",
  },
];

// 每份文档按「页」组织，一页一片，页码就是真实出处
const DOCS = [
  {
    owner: "wang",
    filename: "宏远建材-2026年度报价单.pdf",
    source_type: "pdf",
    mime: "application/pdf",
    pages: [
      "宏远建材有限公司 2026 年度供货报价单\n编制：华东区销售部\n有效期：2026-01-01 至 2026-12-31\n本报价单为框架价，具体单笔订单以确认单为准。所有价格均为含税价，税率 13%。",
      "一、主材报价\n复合地板（橡木纹）：市场指导价 218 元/㎡，年框价 186 元/㎡。\n实木多层地板：市场指导价 365 元/㎡，年框价 312 元/㎡。\n宏远建材单笔满 800 ㎡再让 3 个点，这是给他们的最低线，⛔ 不要再往下让。\n踢脚线（同色）：18 元/米，随主材同批发货不另收运费。",
      "二、辅材与安装\n地板胶（环保 E0 级）：45 元/桶，每 100 ㎡约用 3 桶。\n安装人工：28 元/㎡，含基层找平；若需自流平另计 22 元/㎡。\n宏远建材的项目一般在周末进场，安装队要提前 5 天排期，临时加派要加 15% 急件费。",
      "三、账期与结算\n宏远建材账期为月结 60 天，这是 2024 年谈下来的特例，其他同规模客户都是月结 30 天。\n超期 15 天以上暂停发货，这条要在合同里写死。\n对接人是他们采购部的孙主管，签字权在 50 万以内；超过 50 万要他们分管副总签。",
      "四、历史成交参考\n2025 年宏远建材累计采购 1420 万元，其中复合地板占 62%。\n2025 年 Q3 曾因交期延误赔付 8.6 万元，此后他们对交期特别敏感，报交期时务必留 5 天余量。\n他们内部年底会做供应商评分，交期权重 40%，价格只占 30%。",
    ],
  },
  {
    owner: "wang",
    filename: "宏远建材-框架采购合同（2026）.docx",
    source_type: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    headings: [
      "第1章 总则 > 1.1 合同主体",
      "第2章 价格与结算 > 2.1 价格条款",
      "第2章 价格与结算 > 2.3 付款方式",
      "第3章 交付 > 3.2 交期与违约",
      "第4章 其他 > 4.1 争议解决",
    ],
    pages: [
      "甲方：宏远建材有限公司；乙方：本公司。双方就 2026 年度地板类产品采购事宜达成本框架协议。本协议不构成具体订单，具体数量以甲方逐笔下达的采购订单为准。",
      "价格执行乙方《2026 年度供货报价单》所列年框价。年框价在协议期内锁定，原材料涨幅超过 8% 时双方可协商调整，但单次调整不超过 5%。",
      "付款方式为月结 60 天，甲方于每月 25 日前完成上月对账，对账确认后 60 个自然日内付款。逾期付款按日万分之五计违约金。",
      "乙方应在甲方订单确认后 20 个工作日内完成交付。逾期每日按该批次货值的千分之三支付违约金，累计不超过该批次货值的 10%。因不可抗力导致的延误不在此列。",
      "本协议争议由乙方所在地人民法院管辖。本协议一式肆份，双方各执贰份，自双方盖章之日起生效。",
    ],
  },
  {
    owner: "wang",
    filename: "华东区客户资料汇总.xlsx",
    source_type: "xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sheetRows: [
      "客户名称 | 对接人 | 职务 | 年采购额(万) | 账期 | 备注",
      "宏远建材有限公司 | 孙主管 | 采购部主管 | 1420 | 月结60天 | 交期敏感，报价留余量",
      "泰兴装饰工程 | 周经理 | 工程部经理 | 680 | 月结30天 | 只走对公，不接受个人转账",
      "云汇家居连锁 | 吴总监 | 采购总监 | 950 | 月结45天 | 每季度要一次对账函",
      "新叶建设集团 | 郑工 | 技术负责人 | 310 | 预付30% | 对环保等级要求高，只收 E0 级",
      "锦华物业 | 冯主任 | 后勤主任 | 120 | 现结 | 单量小但回款快，适合冲月底指标",
    ],
  },
  {
    owner: "zhao",
    filename: "供应商准入与评估清单.xlsx",
    source_type: "xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sheetRows: [
      "供应商 | 品类 | 准入状态 | 评分 | 账期 | 备注",
      "恒美板材 | 基材 | 已准入 | 92 | 月结30天 | 唯一能稳定供 E0 级基材的",
      "立丰化工 | 胶粘剂 | 已准入 | 85 | 月结30天 | 旺季要提前45天下单，否则排不上",
      "远航物流 | 运输 | 已准入 | 78 | 月结15天 | 华东线便宜但华南线慢，华南建议换家",
      "青岭木业 | 基材 | 观察中 | 61 | 预付50% | 价格低但批次色差大，暂不上量",
      "鼎立五金 | 配件 | 已准入 | 88 | 月结30天 | 老板认人，走关系比走流程快",
    ],
  },
  {
    owner: "zhao",
    filename: "采购流程手册.md",
    source_type: "md",
    mime: "text/markdown",
    sections: ["第 1 节 请购", "第 2 节 询比价", "第 3 节 下单与验收", "第 4 节 异常处理"],
    pages: [
      "所有请购必须先在系统里提请购单，单笔 5 万以下由采购主管审批，5 万以上需分管副总审批。⛔ 不允许先采购后补单，这条从 2025 年起是红线。",
      "单笔 10 万以上必须三家比价，比价记录要留档两年。比价时不只看单价，要把运费、账期折算成综合成本再比。",
      "下单后录 PO 号，到货由仓库和需求部门双签验收。基材类每批抽检 3%，检出不合格整批退。",
      "供应商延期超 3 天要在群里报备并给出补救方案。同一供应商季度内延期两次，评分直接扣 10 分，触发重新评估。",
    ],
  },
];

const MEMORIES = [
  // 王销售 —— 12 条
  { owner: "wang", cat: "客户约定", title: "宏远建材账期是月结 60 天（特例）", content: "宏远建材的账期是 2024 年单独谈下来的月结 60 天，同规模客户都是月结 30 天。续签时对方大概率会拿这条当既得利益，别主动提改。", file: "宏远建材-2026年度报价单.pdf", page: 4, visible: true },
  { owner: "wang", cat: "报价底线", title: "复合地板年框价 186 元/㎡ 是底线", content: "复合地板年框价 186 元/㎡，单笔满 800 ㎡可以再让 3 个点，到 180.4 元/㎡ 就是最低线，再往下要走审批。", file: "宏远建材-2026年度报价单.pdf", page: 2, visible: false },
  { owner: "wang", cat: "客户约定", title: "宏远建材对交期极度敏感", content: "2025 年 Q3 因交期延误赔了 8.6 万，此后他们年度评分里交期权重 40%、价格只占 30%。报交期务必留 5 天余量。", file: "宏远建材-2026年度报价单.pdf", page: 5, visible: true },
  { owner: "wang", cat: "人际雷区", title: "宏远建材孙主管签字权 50 万封顶", content: "对接人是采购部孙主管，50 万以内他能签；超过 50 万要他们分管副总签。⛔ 不要越过孙主管直接找副总，他很在意这个。", file: "宏远建材-2026年度报价单.pdf", page: 4, visible: false },
  { owner: "wang", cat: "流程习惯", title: "宏远建材的项目周末进场，安装队提前 5 天排期", content: "他们的工地一般周末进场施工。安装队要提前 5 天排期，临时加派要收 15% 急件费，这笔钱不好向客户开口，尽量提前问清时间。", file: "宏远建材-2026年度报价单.pdf", page: 3, visible: false },
  { owner: "wang", cat: "客户约定", title: "泰兴装饰只走对公，不接受个人转账", content: "泰兴装饰工程的周经理明确说过只走对公账户，任何形式的个人转账他们财务不认。", file: "华东区客户资料汇总.xlsx", page: 3, visible: true },
  { owner: "wang", cat: "流程习惯", title: "云汇家居每季度要一次对账函", content: "云汇家居连锁的吴总监要求每季度末出一次盖章对账函，晚了他们财务会卡付款。提前一周准备。", file: "华东区客户资料汇总.xlsx", page: 4, visible: false },
  { owner: "wang", cat: "客户约定", title: "新叶建设只收 E0 级环保等级", content: "新叶建设集团的郑工对环保等级卡得很死，只收 E0 级，E1 级连样品都不看。报价时直接按 E0 报。", file: "华东区客户资料汇总.xlsx", page: 5, visible: true },
  { owner: "wang", cat: "流程习惯", title: "锦华物业适合月底冲指标", content: "锦华物业单量小但现结、回款快，月底差一点指标时找冯主任补一单最省事。", file: "华东区客户资料汇总.xlsx", page: 6, visible: false },
  { owner: "wang", cat: "报价底线", title: "原材料涨超 8% 才能提调价，单次不超 5%", content: "框架合同写明：原材料涨幅超过 8% 时双方可协商调价，但单次调整幅度不超过 5%。别在没到 8% 时就提，会被对方拿来做文章。", file: "宏远建材-框架采购合同（2026）.docx", page: 2, visible: false },
  { owner: "wang", cat: "客户约定", title: "逾期交付违约金日千分之三，累计封顶 10%", content: "合同第 3.2 条：逾期每日按该批次货值千分之三计违约金，累计不超过该批次货值的 10%。谈判时这条是我们争取来的封顶条款，别轻易松口。", file: "宏远建材-框架采购合同（2026）.docx", page: 4, visible: false },
  { owner: "wang", cat: "人际雷区", title: "别在宏远建材面前提泰兴装饰", content: "这两家在同一个片区抢过项目，孙主管私下抱怨过。聊天时避开泰兴这个名字。", file: null, page: null, visible: false },
  // 赵采购 —— 6 条（与销售侧完全无关，用来验证隔离）
  { owner: "zhao", cat: "供应商渠道", title: "恒美板材是唯一稳定供 E0 级基材的", content: "恒美板材评分 92，是目前唯一能稳定供 E0 级基材的供应商。备选还没找到，这条是采购侧的单点风险。", file: "供应商准入与评估清单.xlsx", page: 2, visible: true },
  { owner: "zhao", cat: "供应商渠道", title: "立丰化工旺季要提前 45 天下单", content: "胶粘剂旺季（每年 8–10 月）立丰化工产能吃紧，要提前 45 天下单，否则排不上产。", file: "供应商准入与评估清单.xlsx", page: 3, visible: true },
  { owner: "zhao", cat: "供应商渠道", title: "远航物流华南线慢，建议换家", content: "远航物流华东线价格好，但华南线时效差，评分只有 78。华南建议单独找一家。", file: "供应商准入与评估清单.xlsx", page: 4, visible: false },
  { owner: "zhao", cat: "流程习惯", title: "单笔 10 万以上必须三家比价并留档两年", content: "比价记录要留档两年，且比价时要把运费和账期折算成综合成本再比，不能只看单价。", file: "采购流程手册.md", page: 2, visible: false },
  { owner: "zhao", cat: "流程习惯", title: "先采购后补单是红线", content: "2025 年起明确：⛔ 不允许先采购后补请购单。审计查到直接算流程违规。", file: "采购流程手册.md", page: 1, visible: false },
  { owner: "zhao", cat: "人际雷区", title: "鼎立五金老板认人不认流程", content: "鼎立五金的老板习惯直接找熟人对接，走正式流程反而慢。但对账一定要走系统，别用微信口头确认。", file: "供应商准入与评估清单.xlsx", page: 6, visible: false },
];

async function main() {
  // 1. 员工
  const empIds = {};
  for (const e of EMPLOYEES) {
    const { data: exist } = await sb
      .from("bt_employees")
      .select("id")
      .eq("employee_code", e.employee_code)
      .maybeSingle();
    if (exist) {
      empIds[e.employee_code] = exist.id;
      continue;
    }
    const { data, error } = await sb.from("bt_employees").insert(e).select("id").single();
    if (error) throw new Error(`建员工 ${e.employee_code} 失败：${error.message}`);
    empIds[e.employee_code] = data.id;
  }
  console.log("员工就位：", Object.keys(empIds).join(" / "));

  // 2. 文件 + 切片
  const fileIds = {};
  for (const d of DOCS) {
    const owner = empIds[d.owner];
    const { data: exist } = await sb
      .from("bt_files")
      .select("id")
      .eq("owner_employee_id", owner)
      .eq("original_filename", d.filename)
      .maybeSingle();
    if (exist) {
      fileIds[d.filename] = exist.id;
      continue;
    }

    // 组装切片：每一「页 / 章节 / 行区间」一片，出处标签按格式区分
    let chunks = [];
    if (d.sheetRows) {
      const header = d.sheetRows[0];
      chunks = d.sheetRows.slice(1).map((row, i) => ({
        idx: i,
        pageNo: null,
        label: `Sheet1!${i + 2}行`,
        heading: null,
        // xlsx 的每片必须带表头行，否则脱离表头的数字没有语义
        content: `${header}\n${row}`,
      }));
    } else {
      chunks = d.pages.map((text, i) => ({
        idx: i,
        pageNo: d.source_type === "pdf" ? i + 1 : null,
        label:
          d.source_type === "pdf"
            ? `第 ${i + 1} 页`
            : d.headings
              ? d.headings[i]
              : d.sections
                ? d.sections[i]
                : `第 ${i + 1} 节`,
        heading: d.headings ? d.headings[i] : (d.sections ? d.sections[i] : null),
        content: text,
      }));
    }

    const fullText = chunks.map((c) => c.content).join("\n\n");
    const { data: f, error: fe } = await sb
      .from("bt_files")
      .insert({
        owner_employee_id: owner,
        original_filename: d.filename,
        storage_provider: "inline",
        storage_url: null,
        inline_content: fullText,
        mime_type: d.mime,
        file_size_bytes: Buffer.byteLength(fullText, "utf8"),
        source_type: d.source_type,
        page_count: d.source_type === "pdf" ? chunks.length : null,
        parse_status: "done",
        total_chunks: chunks.length,
        embedded_chunks: 0,
      })
      .select("id")
      .single();
    if (fe) throw new Error(`建文件 ${d.filename} 失败：${fe.message}`);
    fileIds[d.filename] = f.id;

    const { error: ce } = await sb.from("bt_chunks").insert(
      chunks.map((c) => ({
        file_id: f.id,
        owner_employee_id: owner,
        chunk_index: c.idx,
        page_no: c.pageNo,
        page_label: c.label,
        heading_path: c.heading,
        content: c.content,
        content_norm: norm(c.content),
        char_count: c.content.length,
        embedding_status: "pending",
      })),
    );
    if (ce) throw new Error(`写切片 ${d.filename} 失败：${ce.message}`);
    console.log(`文件入库：${d.filename}（${chunks.length} 片）`);
  }

  // 3. 记忆条目
  for (const m of MEMORIES) {
    const owner = empIds[m.owner];
    const { data: exist } = await sb
      .from("bt_memories")
      .select("id")
      .eq("owner_employee_id", owner)
      .eq("title", m.title)
      .maybeSingle();
    if (exist) continue;

    let chunkId = null;
    let label = null;
    const fid = m.file ? fileIds[m.file] : null;
    if (fid && m.page) {
      const { data: c } = await sb
        .from("bt_chunks")
        .select("id, page_label")
        .eq("file_id", fid)
        .eq("chunk_index", m.page - 1)
        .maybeSingle();
      if (c) {
        chunkId = c.id;
        label = `${m.file} · ${c.page_label}`;
      }
    }
    const { error } = await sb.from("bt_memories").insert({
      owner_employee_id: owner,
      category: m.cat,
      title: m.title,
      content: m.content,
      source_file_id: fid,
      source_chunk_id: chunkId,
      source_label: label,
      is_editable: true,
      visible_to_colleagues: m.visible,
      include_in_handover_default: true,
    });
    if (error) throw new Error(`写记忆 ${m.title} 失败：${error.message}`);
  }
  console.log(`记忆条目就位：${MEMORIES.length} 条`);

  const { count: fc } = await sb.from("bt_files").select("id", { count: "exact", head: true });
  const { count: cc } = await sb.from("bt_chunks").select("id", { count: "exact", head: true });
  const { count: mc } = await sb.from("bt_memories").select("id", { count: "exact", head: true });
  console.log(`\n完成：文件 ${fc} 份 / 切片 ${cc} 片 / 记忆 ${mc} 条`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
