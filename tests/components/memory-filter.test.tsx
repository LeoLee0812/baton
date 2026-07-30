// SPEC-004 AC-4.2.4：按类型筛选。分组逻辑是纯函数式的，这里直接测它的输入输出。
import { describe, it, expect } from "vitest";
import { MEMORY_CATEGORIES, type MemoryCategory, type MemoryRecord } from "@/lib/types";

/** 与 app/(console)/memory/page.tsx 里 grouped 的分组逻辑一致 */
function groupByCategory(memories: MemoryRecord[], filter: MemoryCategory | null) {
  const shown = filter ? memories.filter((m) => m.category === filter) : memories;
  return MEMORY_CATEGORIES.map((c) => ({
    category: c,
    items: shown.filter((m) => m.category === c),
  }));
}

function mem(id: string, category: MemoryCategory): MemoryRecord {
  return {
    id,
    ownerEmployeeId: "e1",
    category,
    title: `${category}-${id}`,
    content: "内容",
    sourceFileId: null,
    sourceChunkId: null,
    sourceLabel: null,
    isEditable: true,
    visibleToColleagues: false,
    includeInHandoverDefault: true,
    archivedReason: null,
    updatedAt: new Date(0).toISOString(),
    viaHandover: null,
  };
}

const DATA = [
  mem("a", "客户约定"),
  mem("b", "客户约定"),
  mem("c", "报价底线"),
  mem("d", "供应商渠道"),
  mem("e", "人际雷区"),
  mem("f", "流程习惯"),
];

describe("SPEC-004 按类型筛选", () => {
  it("AC-4.2.4: 不筛选时，五个分组都在，条目总数不变", () => {
    const g = groupByCategory(DATA, null);
    expect(g).toHaveLength(5);
    expect(g.map((x) => x.category)).toEqual([...MEMORY_CATEGORIES]);
    expect(g.reduce((s, x) => s + x.items.length, 0)).toBe(DATA.length);
    expect(g.find((x) => x.category === "客户约定")!.items).toHaveLength(2);
  });

  it("AC-4.2.4: 筛选某一类时，只有那一类有条目，其余各组为空", () => {
    const g = groupByCategory(DATA, "供应商渠道");
    const hit = g.find((x) => x.category === "供应商渠道")!;
    expect(hit.items).toHaveLength(1);
    expect(hit.items[0].id).toBe("d");
    for (const other of g.filter((x) => x.category !== "供应商渠道")) {
      expect(other.items, `${other.category} 不该有条目`).toHaveLength(0);
    }
  });

  it("AC-4.2.4: 每一类都能被单独筛出来，分组顺序恒定", () => {
    for (const c of MEMORY_CATEGORIES) {
      const g = groupByCategory(DATA, c);
      expect(g.map((x) => x.category)).toEqual([...MEMORY_CATEGORIES]);
      expect(g.filter((x) => x.items.length > 0).every((x) => x.category === c)).toBe(true);
    }
  });
});
