"use client";

// 记忆条目：按五类分组的卡片，每卡含结论、出处小字、三个开关（AC-7.2.3 / AC-4.2.x）
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Lock, Pencil, Sparkles, X } from "lucide-react";
import { PageHeader, useIdentity } from "@/components/console-shell";
import { EmptyState, ListSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/identity";
import { MEMORY_CATEGORIES, type MemoryCategory, type MemoryRecord, type FileRecord } from "@/lib/types";

export function MemoryCard({
  m,
  onPatch,
}: {
  m: MemoryRecord;
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.content);
  const [saving, setSaving] = useState(false);
  const mine = !m.viaHandover;

  async function save() {
    setSaving(true);
    try {
      await onPatch(m.id, { content: draft });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-testid="memory-card" className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{m.title}</p>
        {m.archivedReason && (
          <Badge variant="outline" className="shrink-0 text-[11px]">
            {m.archivedReason}
          </Badge>
        )}
        {m.viaHandover && (
          <Badge variant="outline" className="shrink-0 text-[11px]">
            {m.viaHandover.fromName} 交接
          </Badge>
        )}
      </div>

      {editing ? (
        <div className="mt-2">
          <Textarea
            data-testid="memory-editor"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className="text-xs"
          />
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={save} disabled={saving} data-testid="memory-save">
              <Check className="size-3.5" />
              保存
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(m.content);
                setEditing(false);
              }}
            >
              <X className="size-3.5" />
              取消
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
          {m.content}
        </p>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        <span data-testid="memory-source" className="text-[11px] text-muted-foreground/80">
          {m.sourceLabel ?? "手工整理，无文档出处"}
        </span>
        {mine && !editing && (
          <button
            type="button"
            data-testid="memory-edit-btn"
            disabled={!m.isEditable}
            onClick={() => setEditing(true)}
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {m.isEditable ? <Pencil className="size-3" /> : <Lock className="size-3" />}
            {m.isEditable ? "编辑" : "已锁定"}
          </button>
        )}
      </div>

      <div className="mt-3 space-y-2 border-t border-border pt-3">
        {(
          [
            ["switch-editable", "可编辑", m.isEditable, "isEditable"],
            ["switch-visible", "同事可问到", m.visibleToColleagues, "visibleToColleagues"],
            [
              "switch-handover",
              "交接时默认勾选",
              m.includeInHandoverDefault,
              "includeInHandoverDefault",
            ],
          ] as const
        ).map(([tid, label, checked, key]) => (
          <label key={tid} className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">{label}</span>
            <Switch
              data-testid={tid}
              checked={checked}
              disabled={!mine}
              onCheckedChange={(v: boolean) => onPatch(m.id, { [key]: v })}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

export default function MemoryPage() {
  const { version, ready } = useIdentity();
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<MemoryCategory | null>(null);
  const [extracting, setExtracting] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch<{ memories: MemoryRecord[] }>("/api/memory"),
      apiFetch<{ files: FileRecord[] }>("/api/files"),
    ])
      .then(([m, f]) => {
        setMemories(m.memories);
        setFiles(f.files.filter((x) => x.parseStatus === "done" && !x.viaHandover));
      })
      .catch((e: Error) => toast.error(`记忆条目加载失败：${e.message}`))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (ready) reload();
  }, [ready, version, reload]);

  const onPatch = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      try {
        const d = await apiFetch<{ memory: MemoryRecord }>(`/api/memory/${id}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        setMemories((prev) => prev.map((m) => (m.id === id ? d.memory : m)));
        toast.success("已保存");
      } catch (e) {
        toast.error(`保存失败：${(e as Error).message}`);
        throw e;
      }
    },
    [],
  );

  async function extract(fileId: string) {
    setExtracting(true);
    try {
      const d = await apiFetch<{ created: number; skipped: number }>("/api/memory/extract", {
        method: "POST",
        body: JSON.stringify({ fileId }),
      });
      toast.success(`抽取完成：新增 ${d.created} 条，跳过重复 ${d.skipped} 条`);
      reload();
    } catch (e) {
      toast.error(`抽取失败：${(e as Error).message}`);
    } finally {
      setExtracting(false);
    }
  }

  const grouped = useMemo(() => {
    const shown = filter ? memories.filter((m) => m.category === filter) : memories;
    return MEMORY_CATEGORIES.map((c) => ({
      category: c,
      items: shown.filter((m) => m.category === c),
    }));
  }, [memories, filter]);

  return (
    <>
      <PageHeader
        title="记忆条目"
        desc="从文档里抽出来的、值得交接的结论。每条都指得回原文，也都能被单独开关。"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter(null)}
          data-testid="filter-all"
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
            filter === null
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card hover:bg-accent"
          }`}
        >
          全部 {memories.length}
        </button>
        {MEMORY_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            data-testid="filter-chip"
            onClick={() => setFilter(filter === c ? null : c)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              filter === c
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-accent"
            }`}
          >
            {c} {memories.filter((m) => m.category === c).length}
          </button>
        ))}

        {files.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">从文档抽取：</span>
            <select
              data-testid="extract-select"
              disabled={extracting}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  void extract(e.target.value);
                  e.target.value = "";
                }
              }}
              className="max-w-56 rounded-lg border border-border bg-card px-2 py-1 text-xs"
            >
              <option value="">{extracting ? "抽取中…" : "选一份文档"}</option>
              {files.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.originalFilename}
                </option>
              ))}
            </select>
            <Sparkles className="size-3.5 text-muted-foreground" />
          </div>
        )}
      </div>

      {loading ? (
        <ListSkeleton rows={5} />
      ) : memories.length === 0 ? (
        <EmptyState
          title="还没有记忆条目"
          hint="先去「我的知识库」传一份资料，然后在这里选中它点抽取，系统会把里面值得交接的结论整理成条目。"
        />
      ) : (
        <div className="space-y-6">
          {grouped.map((g) => (
            <section key={g.category} data-testid="memory-group">
              <h2 className="mb-2.5 flex items-center gap-2 text-sm font-medium">
                {g.category}
                <span className="rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-normal text-accent-foreground">
                  {g.items.length}
                </span>
              </h2>
              {g.items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
                  这一类还没有条目
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {g.items.map((m) => (
                    <MemoryCard key={m.id} m={m} onPatch={onPatch} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
