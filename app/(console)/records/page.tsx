"use client";

// 记录页：交接记录 / 跨人提问记录 两个 tab（AC-7.2.5 / AC-5.3.1 / AC-6.2.1）
// 记录只增不改，页面上没有任何编辑入口（AC-5.3.3）。
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, useIdentity } from "@/components/console-shell";
import { EmptyState, ListSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/identity";
import { HANDOVER_REASON_LABEL, type AgentQueryRecord, type HandoverRecord } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  submitted: "已发起",
  viewed: "对方已查看",
  completed: "已确认",
  cancelled: "已作废",
};

export default function RecordsPage() {
  const { version, ready } = useIdentity();
  const [tab, setTab] = useState<"handover" | "cross">("handover");
  const [handovers, setHandovers] = useState<HandoverRecord[]>([]);
  const [queries, setQueries] = useState<AgentQueryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // setState 只在 promise 回调里，理由同 knowledge 页
  const reload = useCallback(() => {
    return apiFetch<{ handovers: HandoverRecord[]; queries: AgentQueryRecord[] }>("/api/records")
      .then((d) => {
        setHandovers(d.handovers);
        setQueries(d.queries);
      })
      .catch((e: Error) => toast.error(`记录加载失败：${e.message}`))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!ready) return;
    void reload();
  }, [ready, version, reload]);

  return (
    <>
      <PageHeader title="记录" desc="交接和跨人提问都留痕。记录只增不改。" />

      <div className="mb-4 inline-flex rounded-lg border border-border bg-card p-0.5">
        <button
          type="button"
          data-testid="tab-handover"
          onClick={() => setTab("handover")}
          className={`rounded-md px-3.5 py-1.5 text-sm transition-colors ${
            tab === "handover" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
          }`}
        >
          交接记录 {handovers.length}
        </button>
        <button
          type="button"
          data-testid="tab-cross"
          onClick={() => setTab("cross")}
          className={`rounded-md px-3.5 py-1.5 text-sm transition-colors ${
            tab === "cross" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
          }`}
        >
          跨人提问 {queries.length}
        </button>
      </div>

      {loading ? (
        <ListSkeleton rows={5} />
      ) : tab === "handover" ? (
        <div data-testid="handover-panel">
          {handovers.length === 0 ? (
            <EmptyState
              title="还没有交接记录"
              hint="去「交接」页勾一批条目发起一次，对方确认后这里就会留下完整一行。"
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="bt-table w-full text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 text-left font-medium">谁交给谁</th>
                    <th className="px-4 text-left font-medium">原因</th>
                    <th className="px-4 text-left font-medium">交了什么</th>
                    <th className="px-4 text-left font-medium">发起时间</th>
                    <th className="px-4 text-left font-medium">对方确认时间</th>
                    <th className="px-4 text-left font-medium">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {handovers.map((h) => (
                    <tr
                      key={h.id}
                      data-testid="handover-record-row"
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="px-4">
                        {h.fromName} → {h.toName}
                      </td>
                      <td className="px-4 text-xs">{HANDOVER_REASON_LABEL[h.reason]}</td>
                      <td className="px-4 text-xs text-muted-foreground">
                        记忆 {h.memoryCount ?? 0} 条 · 文件 {h.fileCount ?? 0} 份
                      </td>
                      <td className="px-4 text-xs text-muted-foreground">
                        {h.submittedAt
                          ? new Date(h.submittedAt).toLocaleString("zh-CN", {
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className="px-4 text-xs text-muted-foreground">
                        {h.completedAt
                          ? new Date(h.completedAt).toLocaleString("zh-CN", {
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className="px-4">
                        <Badge variant={h.status === "completed" ? "default" : "outline"}>
                          {STATUS_LABEL[h.status] ?? h.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div data-testid="cross-panel">
          {queries.length === 0 ? (
            <EmptyState
              title="还没有跨人提问"
              hint="当你的 Agent 在自己资料里查不到时，可以去问同事的 Agent——只能问到对方开了「同事可问到」开关的条目。"
            />
          ) : (
            <ul className="space-y-2.5">
              {queries.map((q) => (
                <li
                  key={q.id}
                  data-testid="cross-record-row"
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-[11px]">
                      {q.askingName} → {q.targetName || "自己"}
                    </Badge>
                    <span>
                      {new Date(q.createdAt).toLocaleString("zh-CN", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {q.latencyMs != null && <span>耗时 {q.latencyMs}ms</span>}
                    <span>hop {q.hop}</span>
                  </div>
                  <p className="text-sm font-medium">问：{q.queryText}</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                    {q.answerText ?? "（没有答案）"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
