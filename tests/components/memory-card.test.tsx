// SPEC-004 场景 4.2 的组件层：三个开关、就地编辑、锁定态、按类型筛选。
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryCard } from "@/app/(console)/memory/page";
import { MEMORY_CATEGORIES, type MemoryRecord } from "@/lib/types";

function make(patch: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: "m1",
    ownerEmployeeId: "e1",
    category: "客户约定",
    title: "宏远建材账期月结 60 天",
    content: "这是 2024 年单独谈下来的特例，同规模客户都是月结 30 天。",
    sourceFileId: "f1",
    sourceChunkId: "c1",
    sourceLabel: "宏远建材-2026年度报价单.pdf · 第 4 页",
    isEditable: true,
    visibleToColleagues: false,
    includeInHandoverDefault: true,
    archivedReason: null,
    updatedAt: new Date(0).toISOString(),
    viaHandover: null,
    ...patch,
  };
}

describe("SPEC-004 记忆卡片", () => {
  it("AC-4.2.2: 三个开关各自独立，切换只回传自己那一个字段", () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    render(<MemoryCard m={make()} onPatch={onPatch} />);

    fireEvent.click(screen.getByTestId("switch-visible"));
    expect(onPatch).toHaveBeenLastCalledWith("m1", { visibleToColleagues: true });

    fireEvent.click(screen.getByTestId("switch-handover"));
    expect(onPatch).toHaveBeenLastCalledWith("m1", { includeInHandoverDefault: false });

    fireEvent.click(screen.getByTestId("switch-editable"));
    expect(onPatch).toHaveBeenLastCalledWith("m1", { isEditable: false });

    expect(onPatch).toHaveBeenCalledTimes(3);
  });

  it("AC-4.1.1: 卡片上必须显示出处，指得回原文的第几页", () => {
    render(<MemoryCard m={make()} onPatch={vi.fn()} />);
    const src = screen.getByTestId("memory-source");
    expect(src).toHaveTextContent("宏远建材-2026年度报价单.pdf");
    expect(src).toHaveTextContent("第 4 页");
  });

  it("AC-4.2.1: 就地编辑正文后保存，把新内容回传上层", async () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    render(<MemoryCard m={make()} onPatch={onPatch} />);

    fireEvent.click(screen.getByTestId("memory-edit-btn"));
    const editor = screen.getByTestId("memory-editor");
    fireEvent.change(editor, { target: { value: "改成月结 30 天。" } });
    fireEvent.click(screen.getByTestId("memory-save"));

    expect(onPatch).toHaveBeenCalledWith("m1", { content: "改成月结 30 天。" });
  });

  it("AC-4.2.3: is_editable=false 时前端就不给编辑入口（服务端另有一道硬拦）", () => {
    render(<MemoryCard m={make({ isEditable: false })} onPatch={vi.fn()} />);
    const btn = screen.getByTestId("memory-edit-btn");
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("已锁定");
    expect(screen.queryByTestId("memory-editor")).not.toBeInTheDocument();
  });

  it("AC-5.2.3: 交接来的条目标出来源，且改不动（它不归你——交接给的是可见权，不是编辑权）", () => {
    const onPatch = vi.fn();
    render(
      <MemoryCard
        m={make({ viaHandover: { fromName: "王销售", grantedAt: "2026-07-31" } })}
        onPatch={onPatch}
      />,
    );
    expect(screen.getByText("王销售 交接")).toBeInTheDocument();
    expect(screen.queryByTestId("memory-edit-btn")).not.toBeInTheDocument();

    // base-ui 的 Switch 用 data-disabled 表达禁用态（不是原生 disabled 属性），
    // 所以这里断言的是**真实行为**：点下去不会触发任何回传
    for (const tid of ["switch-editable", "switch-visible", "switch-handover"]) {
      const sw = screen.getByTestId(tid);
      expect(sw).toHaveAttribute("data-disabled");
      fireEvent.click(sw);
    }
    expect(onPatch, "交接来的条目被改动了").not.toHaveBeenCalled();
  });

  it("AC-5.3.2: 被封存的条目在卡片上明确标出来，内容仍然完整可读（⛔ 不是删除）", () => {
    render(<MemoryCard m={make({ archivedReason: "已随账号封存" })} onPatch={vi.fn()} />);
    expect(screen.getByText("已随账号封存")).toBeInTheDocument();
    expect(screen.getByText(/2024 年单独谈下来的特例/)).toBeInTheDocument();
  });

  it("AC-4.1.2: 五个分类都是合法值，且卡片能渲染任意一类", () => {
    for (const cat of MEMORY_CATEGORIES) {
      const { unmount, container } = render(
        <MemoryCard m={make({ category: cat, title: `${cat}的条目` })} onPatch={vi.fn()} />,
      );
      expect(within(container).getByText(`${cat}的条目`)).toBeInTheDocument();
      unmount();
    }
  });
});
