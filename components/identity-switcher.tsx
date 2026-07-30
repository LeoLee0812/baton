"use client";

// 身份切换器：演示用的视角切换（不是认证）。
// 刻意手写一个轻量下拉而不是用 shadcn Select——后者依赖 Popover/portal，
// 在 jsdom 里渲染不出可断言的 role="option"，而 AC-1.2.1/1.2.2/1.2.3 需要组件级测试守着。

import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { writeIdentity } from "@/lib/identity";

export interface SwitchableEmployee {
  code: string;
  displayName: string;
  title?: string | null;
  avatarEmoji?: string | null;
}

export function IdentitySwitcher({
  employees,
  value,
  onChange,
}: {
  employees: SwitchableEmployee[];
  value: string;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const current = employees.find((e) => e.code === value) ?? employees[0];

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function pick(code: string) {
    writeIdentity(code); // 持久化，刷新后保持（AC-1.2.3）
    setOpen(false);
    onChange(code);
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        data-testid="identity-switcher"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-left transition-colors hover:bg-accent"
      >
        <span className="text-lg leading-none">{current?.avatarEmoji ?? "👤"}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{current?.displayName}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {current?.title ?? "员工"}
          </span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="切换身份"
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-white py-1 shadow-lg"
        >
          {employees.map((e) => (
            <li
              key={e.code}
              role="option"
              aria-selected={e.code === value}
              tabIndex={0}
              onClick={() => pick(e.code)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") pick(e.code);
              }}
              className={cn(
                "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-accent",
                e.code === value && "bg-accent/60",
              )}
            >
              <span className="text-base leading-none">{e.avatarEmoji ?? "👤"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{e.displayName}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {e.title ?? "员工"}
                </span>
              </span>
              {e.code === value && <Check className="size-4 text-primary" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
