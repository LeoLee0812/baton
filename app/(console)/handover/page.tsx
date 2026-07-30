"use client";

// 交接页：左栏选人与原因、右栏可折叠的勾选清单、底部预览与发起、顶部三步进度条。
// 这是全站的主场，允许一点克制的动效（勾选飞入右栏、确认成功微动画）。

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Handshake, Check, FileText, Send } from "lucide-react";
import { PageHeader, useIdentity } from "@/components/console-shell";
import { EmptyState, ListSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/identity";
import {
  HANDOVER_REASON_LABEL,
  MEMORY_CATEGORIES,
  type FileRecord,
  type HandoverReason,
  type MemoryCategory,
  type MemoryRecord,
} from "@/lib/types";
import type { HandoverDetail } from "@/lib/handover";

interface HandoverListItem {
  id: string;
  fromEmployeeId: string;
  toEmployeeId: string;
  fromName?: string;
  toName?: string;
  status: string;
  reason: HandoverReason;
  createdAt: string;
  memoryCount?: number;
  fileCount?: number;
}

export default function HandoverPage() {
  const { code, employees, me, version, ready } = useIdentity();
  const [toCode, setToCode] = useState("");
  const [reason, setReason] = useState<HandoverReason>("role_change");
  const [note, setNote] = useState("");
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [checkedMem, setCheckedMem] = useState<Set<string>>(new Set());
  const [checkedFile, setCheckedFile] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<HandoverDetail | null>(null);
  const [inbox, setInbox] = useState<HandoverListItem[]>([]);
  const [justDone, setJustDone] = useState(false);

  const others = employees.filter((e) => e.employeeCode !== code);

  // setState 只在 promise 回调里，理由同 knowledge 页
  const reload = useCallback(() => {
    return Promise.all([
      apiFetch<{ memories: MemoryRecord[] }>("/api/memory"),
      apiFetch<{ files: FileRecord[] }>("/api/files"),
      apiFetch<{ handovers: HandoverListItem[] }>("/api/handover"),
    ])
      .then(([m, f, h]) => {
        const mine = m.memories.filter((x) => !x.viaHandover && !x.archivedReason);
        setMemories(mine);
        setFiles(f.files.filter((x) => !x.viaHandover));
        // 默认勾选 include_in_handover_default = true 的条目（AC-5.1.3）
        setCheckedMem(new Set(mine.filter((x) => x.includeInHandoverDefault).map((x) => x.id)));
        setCheckedFile(new Set());
        setInbox(h.handovers);
        setDetail(null);
      })
      .catch((e: Error) => toast.error(`交接页数据加载失败：${e.message}`))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!ready) return;
    void reload();
  }, [ready, version, reload]);

  // 接手人下拉的默认值：用派生值而不是 effect 里 setState，避免级联渲染
  const effectiveTo = toCode || others[0]?.employeeCode || "";

  const grouped = useMemo(
    () =>
      MEMORY_CATEGORIES.map((c) => ({
        category: c as MemoryCategory,
        items: memories.filter((m) => m.category === c),
      })).filter((g) => g.items.length > 0),
    [memories],
  );

  const selected = useMemo(
    () => ({
      memories: memories.filter((m) => checkedMem.has(m.id)),
      files: files.filter((f) => checkedFile.has(f.id)),
    }),
    [memories, files, checkedMem, checkedFile],
  );

  function toggleMem(id: string) {
    setCheckedMem((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleGroup(cat: MemoryCategory, on: boolean) {
    const ids = memories.filter((m) => m.category === cat).map((m) => m.id);
    setCheckedMem((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  /** 发起 → 用勾选结果覆盖明细 → 提交 */
  async function createAndSubmit(submitNow: boolean) {
    if (!effectiveTo) return toast.error("先选一个接手人");
    if (selected.memories.length + selected.files.length === 0) {
      return toast.error("一条都没勾，没法交接");
    }
    setBusy(true);
    try {
      const created = await apiFetch<HandoverDetail>("/api/handover", {
        method: "POST",
        body: JSON.stringify({ toCode: effectiveTo, reason, note }),
      });
      const hid = created.handover.id;

      // 服务端已按默认值预勾，这里对齐成用户实际勾的那一份
      const preMem = new Set(
        created.items.filter((i) => i.itemType === "memory").map((i) => i.memoryId!),
      );
      const add = [
        ...selected.memories
          .filter((m) => !preMem.has(m.id))
          .map((m) => ({ itemType: "memory" as const, id: m.id })),
        ...selected.files.map((f) => ({ itemType: "file" as const, id: f.id })),
      ];
      const remove = Array.from(preMem)
        .filter((id) => !checkedMem.has(id))
        .map((id) => ({ itemType: "memory" as const, id }));

      let d = created;
      if (add.length || remove.length) {
        d = await apiFetch<HandoverDetail>(`/api/handover/${hid}/items`, {
          method: "PATCH",
          body: JSON.stringify({ add, remove }),
        });
      }
      if (submitNow) {
        d = await apiFetch<HandoverDetail>(`/api/handover/${hid}/submit`, { method: "POST" });
        toast.success(`已发起交接，等 ${d.handover.toName} 确认`);
      }
      setDetail(d);
      const h = await apiFetch<{ handovers: HandoverListItem[] }>("/api/handover");
      setInbox(h.handovers);
    } catch (e) {
      toast.error(`交接失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, action: "view" | "confirm") {
    setBusy(true);
    try {
      const d = await apiFetch<HandoverDetail>(`/api/handover/${id}/${action}`, { method: "POST" });
      setDetail(d);
      if (action === "confirm") {
        setJustDone(true);
        toast.success("已确认接收，被勾选的内容现在可以查了");
        setTimeout(() => setJustDone(false), 1200);
      }
      const h = await apiFetch<{ handovers: HandoverListItem[] }>("/api/handover");
      setInbox(h.handovers);
    } catch (e) {
      toast.error(`操作失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const pendingForMe = inbox.filter(
    (h) => h.toEmployeeId === me?.id && ["submitted", "viewed"].includes(h.status),
  );
  const steps = detail?.steps ?? [
    { label: "已发起", done: false, at: null },
    { label: "对方已查看", done: false, at: null },
    { label: "对方已确认", done: false, at: null },
  ];

  return (
    <>
      <PageHeader
        title="交接"
        desc="勾出愿意交出去的条目和文件，对方确认后才生效。交接的是可见权，原始归属不变。"
      />

      {/* 三步进度条 */}
      <div
        data-testid="handover-steps"
        className={`mb-6 flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 ${justDone ? "bt-pop" : ""}`}
      >
        {steps.map((s, i) => (
          <div
            key={s.label}
            data-testid="handover-step"
            data-done={s.done ? "true" : "false"}
            className="flex flex-1 items-center gap-3"
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] ${
                  s.done ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground"
                }`}
              >
                {s.done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <div>
                <div className={`text-xs ${s.done ? "font-medium" : "text-muted-foreground"}`}>
                  {s.label}
                </div>
                {s.at && (
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(s.at).toLocaleString("zh-CN", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                )}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-px flex-1 ${s.done ? "bg-primary/40" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      {/* 待我确认 */}
      {pendingForMe.length > 0 && (
        <div className="mb-6 rounded-xl border border-primary/30 bg-accent/40 p-4">
          <h2 className="mb-2 text-sm font-medium">待你确认的交接（{pendingForMe.length}）</h2>
          <ul className="space-y-2">
            {pendingForMe.map((h) => (
              <li
                key={h.id}
                data-testid="inbox-item"
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5"
              >
                <Handshake className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {h.fromName} 要把 {h.memoryCount ?? 0} 条记忆、{h.fileCount ?? 0} 份文件交给你
                  <span className="ml-2 text-xs text-muted-foreground">
                    （{HANDOVER_REASON_LABEL[h.reason]}）
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => act(h.id, "view")}
                  data-testid="inbox-view"
                >
                  查看
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => act(h.id, "confirm")}
                  data-testid="inbox-confirm"
                >
                  确认接收
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-[300px_1fr] gap-6">
        {/* 左栏：选人与原因 */}
        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <label className="mb-1.5 block text-xs text-muted-foreground">从</label>
            <div
              data-testid="handover-from"
              className="mb-3 flex items-center gap-2 rounded-lg bg-accent/50 px-3 py-2 text-sm"
            >
              <span>{me?.avatarEmoji ?? "👤"}</span>
              {me?.displayName ?? "当前身份"}
            </div>

            <label className="mb-1.5 block text-xs text-muted-foreground">交给</label>
            <select
              data-testid="handover-to"
              value={effectiveTo}
              onChange={(e) => setToCode(e.target.value)}
              className="mb-3 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
            >
              {others.map((e) => (
                <option key={e.employeeCode} value={e.employeeCode}>
                  {e.displayName}（{e.title ?? "员工"}）
                </option>
              ))}
            </select>

            <label className="mb-1.5 block text-xs text-muted-foreground">原因</label>
            <div data-testid="handover-reason" className="mb-3 grid grid-cols-3 gap-1.5">
              {(Object.keys(HANDOVER_REASON_LABEL) as HandoverReason[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                    reason === r
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  {HANDOVER_REASON_LABEL[r]}
                </button>
              ))}
            </div>

            <label className="mb-1.5 block text-xs text-muted-foreground">备注（可选）</label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="交代一句，比如「宏远的年框谈判下周开始」"
              className="text-xs"
            />
          </div>

          {/* 已选清单（勾选时飞入这里） */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-2 text-xs font-medium">已选 {selected.memories.length + selected.files.length} 项</h3>
            <div className="max-h-64 space-y-1.5 overflow-y-auto">
              {selected.memories.map((m) => (
                <div
                  key={m.id}
                  className="bt-fly-in truncate rounded-md bg-accent/60 px-2 py-1 text-[11px]"
                >
                  {m.title}
                </div>
              ))}
              {selected.files.map((f) => (
                <div
                  key={f.id}
                  className="bt-fly-in flex items-center gap-1 truncate rounded-md bg-accent/60 px-2 py-1 text-[11px]"
                >
                  <FileText className="size-3 shrink-0" />
                  {f.originalFilename}
                </div>
              ))}
              {selected.memories.length + selected.files.length === 0 && (
                <p className="text-[11px] text-muted-foreground">还没勾任何东西</p>
              )}
            </div>
          </div>
        </aside>

        {/* 右栏：勾选清单 */}
        <section>
          {loading ? (
            <ListSkeleton rows={6} />
          ) : memories.length + files.length === 0 ? (
            <EmptyState
              title="你名下还没有可交接的内容"
              hint="先去「我的知识库」传资料、在「记忆条目」里抽取条目，才有东西可交。"
            />
          ) : (
            <div data-testid="handover-checklist" className="space-y-3">
              {grouped.map((g) => {
                const isCollapsed = collapsed.has(g.category);
                const allOn = g.items.every((m) => checkedMem.has(m.id));
                return (
                  <div
                    key={g.category}
                    className="overflow-hidden rounded-xl border border-border bg-card"
                  >
                    <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsed((p) => {
                            const n = new Set(p);
                            if (n.has(g.category)) n.delete(g.category);
                            else n.add(g.category);
                            return n;
                          })
                        }
                        className="flex items-center gap-1.5 text-sm font-medium"
                      >
                        <ChevronDown
                          className={`size-4 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                        />
                        {g.category}
                      </button>
                      <Badge variant="secondary" className="text-[11px]">
                        {g.items.filter((m) => checkedMem.has(m.id)).length}/{g.items.length}
                      </Badge>
                      <button
                        type="button"
                        onClick={() => toggleGroup(g.category, !allOn)}
                        className="ml-auto text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        {allOn ? "取消全选" : "全选"}
                      </button>
                    </div>
                    {!isCollapsed && (
                      <ul>
                        {g.items.map((m) => (
                          <li
                            key={m.id}
                            data-testid="checklist-item"
                            className="flex items-start gap-2.5 border-b border-border/50 px-4 py-2.5 last:border-0"
                          >
                            <Checkbox
                              checked={checkedMem.has(m.id)}
                              onCheckedChange={() => toggleMem(m.id)}
                              className="mt-0.5"
                              aria-label={m.title}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm">{m.title}</p>
                              <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                                {m.sourceLabel ?? "无文档出处"}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}

              {files.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                    <span className="text-sm font-medium">原始文件</span>
                    <Badge variant="secondary" className="text-[11px]">
                      {checkedFile.size}/{files.length}
                    </Badge>
                  </div>
                  <ul>
                    {files.map((f) => (
                      <li
                        key={f.id}
                        data-testid="checklist-file"
                        className="flex items-center gap-2.5 border-b border-border/50 px-4 py-2.5 last:border-0"
                      >
                        <Checkbox
                          checked={checkedFile.has(f.id)}
                          onCheckedChange={() =>
                            setCheckedFile((p) => {
                              const n = new Set(p);
                              if (n.has(f.id)) n.delete(f.id);
                              else n.add(f.id);
                              return n;
                            })
                          }
                          aria-label={f.originalFilename}
                        />
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {f.originalFilename}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {f.totalChunks} 片
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* 预览 */}
          {detail && (
            <div
              data-testid="handover-preview"
              className="mt-4 rounded-xl border border-primary/30 bg-accent/30 p-4"
            >
              <h3 className="mb-1.5 text-sm font-medium">接手人会看到什么</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {detail.preview.summary}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {detail.preview.byCategory.map((c) => (
                  <Badge key={c.category} variant="outline" className="text-[11px]">
                    {c.category} {c.count}
                  </Badge>
                ))}
                {detail.preview.fileNames.map((n) => (
                  <Badge key={n} variant="secondary" className="text-[11px]">
                    {n}
                  </Badge>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                单号 {detail.handover.id.slice(0, 8)} · 状态 {detail.handover.status}
              </p>
            </div>
          )}

          {/* 底部动作 */}
          <div className="mt-4 flex items-center gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => createAndSubmit(false)}
              data-testid="handover-preview-btn"
            >
              交接预览
            </Button>
            <Button
              disabled={busy}
              onClick={() => createAndSubmit(true)}
              data-testid="handover-submit-btn"
            >
              <Send className="size-4" />
              发起交接
            </Button>
            <span className="text-xs text-muted-foreground">
              已勾 {selected.memories.length} 条记忆 · {selected.files.length} 份文件
            </span>
          </div>
        </section>
      </div>
    </>
  );
}
