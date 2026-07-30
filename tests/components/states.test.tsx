// SPEC-007 场景 7.3 + AC-7.2.6：空态与加载态。⛔ 数据为空时不许白屏，加载中必须有骨架屏。
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { EmptyState, ListSkeleton } from "@/components/states";
import { apiFetch } from "@/lib/identity";

describe("SPEC-007 空态与加载态", () => {
  it("AC-7.2.6: 空态渲染出可读的中文提示，而不是一片空白", () => {
    render(
      <EmptyState
        title="还没有任何资料"
        hint="把 .pdf / .docx 文件拖到上面的方框里，系统会自动解析、切片并向量化。"
      />,
    );
    const box = screen.getByTestId("empty-state");
    expect(box).toBeInTheDocument();
    expect(box).toHaveTextContent("还没有任何资料");
    expect(box).toHaveTextContent("自动解析");
    // 光有个图标不算空态——必须有实打实的文字
    expect((box.textContent ?? "").trim().length).toBeGreaterThan(20);
  });

  it("AC-7.3.2: 加载中渲染骨架屏，且骨架条数可控", () => {
    const { container } = render(<ListSkeleton rows={5} />);
    expect(screen.getByTestId("loading-skeleton")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(5);
  });
});

describe("SPEC-007 API 错误必须被看见", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("AC-7.3.1: apiFetch 把服务端返回的中文错误原样抛出来，供页面 toast 展示", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => JSON.stringify({ error: "这份文件不属于你，也没有通过交接授予给你" }),
      }),
    );

    await expect(apiFetch("/api/files/xxx/chunks")).rejects.toThrow(
      "这份文件不属于你，也没有通过交接授予给你",
    );
  });

  it("AC-7.3.1: 服务端没给 error 字段时，也要抛一条带状态码的可读错误，⛔ 不许静默", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "" }),
    );
    await expect(apiFetch("/api/whatever")).rejects.toThrow("请求失败（HTTP 500）");
  });

  it("AC-1.2.2: apiFetch 每次请求都带上当前身份头，作用域才跟得上身份切换", async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    });
    vi.stubGlobal("fetch", spy);
    window.localStorage.setItem("bt_employee_code", "zhao");

    await apiFetch("/api/memory");

    await waitFor(() => expect(spy).toHaveBeenCalled());
    const headers = spy.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["x-baton-employee"]).toBe("zhao");
  });
});
