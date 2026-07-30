"use client";

// 总览页：四个数字卡 + 员工卡片墙 + 右侧动态时间线（AC-7.2.1）
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, Handshake, NotebookPen, Users } from "lucide-react";
import { PageHeader } from "@/components/console-shell";
import { EmptyState, ListSkeleton } from "@/components/states";
import { apiFetch } from "@/lib/identity";
import type { Employee } from "@/lib/types";

interface Overview {
  stats: { employees: number; files: number; memories: number; handoversThisMonth: number };
  employees: Array<Employee & { fileCount: number; memoryCount: number }>;
  activity: Array<{ id: string; at: string; kind: string; text: string }>;
}

const KIND_COLOR: Record<string, string> = {
  upload: "bg-sky-500",
  handover: "bg-primary",
  cross: "bg-amber-500",
  ask: "bg-neutral-400",
};

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Overview>("/api/overview")
      .then(setData)
      .catch((e: Error) => toast.error(`总览数据加载失败：${e.message}`))
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    { key: "员工", label: "员工", value: data?.stats.employees ?? 0, icon: Users, unit: "人" },
    { key: "文件", label: "文件总数", value: data?.stats.files ?? 0, icon: FileText, unit: "份" },
    {
      key: "记忆条目",
      label: "记忆条目总数",
      value: data?.stats.memories ?? 0,
      icon: NotebookPen,
      unit: "条",
    },
    {
      key: "本月交接",
      label: "本月交接次数",
      value: data?.stats.handoversThisMonth ?? 0,
      icon: Handshake,
      unit: "次",
    },
  ];

  return (
    <>
      <PageHeader
        title="总览"
        desc="公司里每个人手上有多少资料、这个月交接了几次，一眼看完。"
      />

      <div className="grid grid-cols-4 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.key}
              data-testid="stat-card"
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{c.label}</span>
                <Icon className="size-4 text-muted-foreground" />
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl font-semibold tabular-nums">{c.value}</span>
                <span className="text-xs text-muted-foreground">{c.unit}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-[1fr_320px] gap-6">
        <section>
          <h2 className="mb-3 text-sm font-medium">员工与各自的资料</h2>
          {loading ? (
            <ListSkeleton rows={3} />
          ) : data && data.employees.length > 0 ? (
            <div data-testid="employee-wall" className="grid grid-cols-3 gap-4">
              {data.employees.map((e) => (
                <div
                  key={e.id}
                  data-testid="employee-card"
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 items-center justify-center rounded-full bg-accent text-lg">
                      {e.avatarEmoji ?? "👤"}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{e.displayName}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {e.title ?? "员工"}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                    <span>
                      文件 <span className="text-foreground tabular-nums">{e.fileCount}</span>
                    </span>
                    <span>
                      条目 <span className="text-foreground tabular-nums">{e.memoryCount}</span>
                    </span>
                  </div>
                  {e.status !== "active" && (
                    <div className="mt-2 inline-flex rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">
                      {e.status === "offboarding" ? "交接中" : "已离职"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="还没有员工" hint="跑一次 npm run seed 就会有三个示例员工。" />
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium">最近动态</h2>
          {loading ? (
            <ListSkeleton rows={5} />
          ) : (
            <div
              data-testid="timeline"
              className="rounded-xl border border-border bg-card p-4"
            >
              {data && data.activity.length > 0 ? (
                <ol className="space-y-3.5">
                  {data.activity.map((a) => (
                    <li key={a.id} className="flex gap-2.5">
                      <span
                        className={`mt-1.5 size-1.5 shrink-0 rounded-full ${KIND_COLOR[a.kind] ?? "bg-neutral-300"}`}
                      />
                      <div className="min-w-0">
                        <p className="text-xs leading-relaxed">{a.text}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {new Date(a.at).toLocaleString("zh-CN", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="py-6 text-center text-xs text-muted-foreground">还没有任何动态</p>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
