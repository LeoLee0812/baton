// SPEC-001 场景 1.2：身份切换器的组件行为
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IdentitySwitcher } from "@/components/identity-switcher";
import { IDENTITY_STORAGE_KEY } from "@/lib/identity";

const EMPLOYEES = [
  { code: "wang", displayName: "王销售", title: "华东区销售", avatarEmoji: "🧑‍💼" },
  { code: "li", displayName: "李销售", title: "华东区销售", avatarEmoji: "👩‍💼" },
  { code: "zhao", displayName: "赵采购", title: "采购主管", avatarEmoji: "🧑‍🔧" },
];

describe("SPEC-001 身份切换器", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("AC-1.2.1: 三个种子员工都出现在可选项里", () => {
    render(<IdentitySwitcher employees={EMPLOYEES} value="wang" onChange={() => {}} />);
    fireEvent.click(screen.getByTestId("identity-switcher"));

    expect(screen.getByRole("option", { name: /王销售/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /李销售/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /赵采购/ })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("AC-1.2.2: 选中另一个员工时，把新身份的 code 回传给上层", () => {
    const onChange = vi.fn();
    render(<IdentitySwitcher employees={EMPLOYEES} value="wang" onChange={onChange} />);

    fireEvent.click(screen.getByTestId("identity-switcher"));
    fireEvent.click(screen.getByRole("option", { name: /李销售/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("li");
  });

  it("AC-1.2.3: 切换后把当前身份写进 localStorage，刷新后能读回来", () => {
    const { unmount } = render(
      <IdentitySwitcher employees={EMPLOYEES} value="wang" onChange={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("identity-switcher"));
    fireEvent.click(screen.getByRole("option", { name: /赵采购/ }));

    expect(window.localStorage.getItem(IDENTITY_STORAGE_KEY)).toBe("zhao");

    // 模拟刷新：重新挂载后仍应显示上次选中的身份
    unmount();
    render(<IdentitySwitcher employees={EMPLOYEES} value="zhao" onChange={() => {}} />);
    expect(screen.getByTestId("identity-switcher")).toHaveTextContent("赵采购");
  });
});
