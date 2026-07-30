"use client";

// 控制台外壳：左侧栏 + 右内容区，并把「当前身份」通过 context 下发给所有页面。
// 身份变化时 bump 一下 version，页面据此重新取数（AC-1.2.2）。

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Handshake,
  LayoutDashboard,
  Library,
  NotebookPen,
  ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch, DEFAULT_EMPLOYEE_CODE, readIdentity } from "@/lib/identity";
import { IdentitySwitcher, type SwitchableEmployee } from "./identity-switcher";
import type { Employee } from "@/lib/types";

const NAV = [
  { href: "/", label: "总览", icon: LayoutDashboard },
  { href: "/knowledge", label: "我的知识库", icon: Library },
  { href: "/memory", label: "记忆条目", icon: NotebookPen },
  { href: "/handover", label: "交接", icon: Handshake },
  { href: "/records", label: "记录", icon: ScrollText },
] as const;

interface IdentityCtx {
  code: string;
  employees: Employee[];
  me: Employee | null;
  /** 每次身份变化 +1，页面 useEffect 依赖它来重新取数 */
  version: number;
  ready: boolean;
}

const Ctx = createContext<IdentityCtx>({
  code: DEFAULT_EMPLOYEE_CODE,
  employees: [],
  me: null,
  version: 0,
  ready: false,
});

export function useIdentity() {
  return useContext(Ctx);
}

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // 初值直接从 localStorage 读（useState 的惰性初始化在客户端首帧就拿到，
  // 不需要在 effect 里再 setState 一次）。
  const [code, setCode] = useState<string>(DEFAULT_EMPLOYEE_CODE);
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    const stored = readIdentity();
    apiFetch<{ employees: Employee[] }>("/api/employees")
      .then((d) => {
        if (!alive) return;
        // 两个 setState 都在 promise 回调里，不是 effect 体内的同步调用
        setCode(stored);
        setEmployees(d.employees);
      })
      .catch(() => {
        if (alive) setEmployees([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const ready = employees !== null;

  const onChange = useCallback((next: string) => {
    setCode(next);
    setVersion((v) => v + 1);
  }, []);

  const switchable: SwitchableEmployee[] = (employees ?? []).map((e) => ({
    code: e.employeeCode,
    displayName: e.displayName,
    title: e.title,
    avatarEmoji: e.avatarEmoji,
  }));
  const me = (employees ?? []).find((e) => e.employeeCode === code) ?? null;

  return (
    <Ctx.Provider value={{ code, employees: employees ?? [], me, version, ready }}>
      <div className="flex min-h-screen">
        <aside
          data-testid="sidebar"
          className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar"
        >
          <div className="flex items-center gap-2 px-4 py-5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Handshake className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">接棒 Baton</div>
              <div className="truncate text-xs text-muted-foreground">知识交接工作台</div>
            </div>
          </div>

          <div className="px-3 pb-3">
            {switchable.length > 0 ? (
              <IdentitySwitcher employees={switchable} value={code} onChange={onChange} />
            ) : (
              <div
                data-testid="identity-switcher"
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-muted-foreground"
              >
                加载身份中…
              </div>
            )}
          </div>

          <nav className="flex-1 space-y-0.5 px-3">
            {NAV.map((n) => {
              const active = pathname === n.href;
              const Icon = n.icon;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  data-testid="nav-item"
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-foreground/75 hover:bg-accent/60",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-border px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            当前视角：<span className="text-foreground">{me?.displayName ?? "—"}</span>
            <br />
            每个人只看得见自己的资料
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-8 py-7">{children}</main>
      </div>
    </Ctx.Provider>
  );
}

/** 页面通用头部 */
export function PageHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
    </div>
  );
}
