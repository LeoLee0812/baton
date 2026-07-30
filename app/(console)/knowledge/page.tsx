"use client";

// 我的知识库：上半拖拽上传区 + 下半文件表格，点行开抽屉看全部切片与出处（AC-7.2.2）
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Search, UploadCloud } from "lucide-react";
import { PageHeader, useIdentity } from "@/components/console-shell";
import { EmptyState, ListSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { apiFetch } from "@/lib/identity";
import { ALLOWED_EXTENSIONS, statusLabel, statusProgress } from "@/lib/upload";
import type { ChunkRecord, FileRecord, SearchHit } from "@/lib/types";
import { useUpload } from "@/components/use-upload";

function StatusBadge({ f }: { f: FileRecord }) {
  if (f.parseStatus === "failed") {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="size-3" />
        {f.parseError ? "处理失败" : "失败"}
      </Badge>
    );
  }
  if (f.parseStatus === "done") return <Badge variant="secondary">已入库</Badge>;
  return <Badge variant="outline">{statusLabel(f.parseStatus, f.totalChunks)}</Badge>;
}

export default function KnowledgePage() {
  const { version, code, ready } = useIdentity();
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<FileRecord | null>(null);
  const [chunks, setChunks] = useState<ChunkRecord[]>([]);
  const [chunkLoading, setChunkLoading] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    apiFetch<{ files: FileRecord[] }>("/api/files")
      .then((d) => setFiles(d.files))
      .catch((e: Error) => toast.error(`文件列表加载失败：${e.message}`))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (ready) reload();
  }, [ready, version, reload]);

  const upload = useUpload({ onDone: reload });

  async function openFile(f: FileRecord) {
    setCurrent(f);
    setOpen(true);
    setChunkLoading(true);
    try {
      const d = await apiFetch<{ chunks: ChunkRecord[] }>(`/api/files/${f.id}/chunks`);
      setChunks(d.chunks);
    } catch (e) {
      toast.error(`切片加载失败：${(e as Error).message}`);
      setChunks([]);
    } finally {
      setChunkLoading(false);
    }
  }

  async function doSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) {
      setHits(null);
      return;
    }
    setSearching(true);
    try {
      const d = await apiFetch<{ hits: SearchHit[] }>(
        `/api/search?q=${encodeURIComponent(q.trim())}`,
      );
      setHits(d.hits);
      if (d.hits.length === 0) toast.info("我的资料里没有命中这个词");
    } catch (err) {
      toast.error(`搜索失败：${(err as Error).message}`);
    } finally {
      setSearching(false);
    }
  }

  return (
    <>
      <PageHeader
        title="我的知识库"
        desc="传进来的资料只属于你自己。别人搜不到，除非你通过交接把它交出去。"
      />

      {/* 上传区 */}
      <div
        data-testid="dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          upload.setDragging(true);
        }}
        onDragLeave={() => upload.setDragging(false)}
        onDrop={upload.onDrop}
        className={`rounded-xl border-2 border-dashed bg-card px-6 py-9 text-center transition-colors ${
          upload.dragging ? "border-primary bg-accent/40" : "border-border"
        }`}
      >
        <UploadCloud className="mx-auto mb-2 size-6 text-muted-foreground" />
        <p className="text-sm font-medium">把文件拖到这里，或者</p>
        <label className="mt-2 inline-block">
          <input
            type="file"
            className="hidden"
            accept={ALLOWED_EXTENSIONS.map((e) => "." + e).join(",")}
            onChange={upload.onPick}
          />
          <span className="inline-flex cursor-pointer items-center rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">
            选择文件
          </span>
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          支持 {ALLOWED_EXTENSIONS.map((e) => "." + e).join(" / ")}，单个文件不超过 20MB
        </p>
        {upload.busy && (
          <div className="mx-auto mt-4 max-w-sm text-left">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span className="truncate">{upload.name}</span>
              <span>{upload.stage}</span>
            </div>
            <Progress value={upload.percent} className="h-1.5" />
          </div>
        )}
      </div>

      {/* 搜索 */}
      <form onSubmit={doSearch} className="mt-6 flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="在我的资料里搜一个客户名、金额或条款…"
          data-testid="search-input"
          className="max-w-md bg-card"
        />
        <Button type="submit" disabled={searching} data-testid="search-btn">
          <Search className="size-4" />
          {searching ? "搜索中" : "搜索"}
        </Button>
        {hits !== null && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setHits(null);
              setQ("");
            }}
          >
            清空
          </Button>
        )}
      </form>

      {hits !== null && (
        <section className="mt-4" data-testid="search-results">
          <h2 className="mb-2 text-sm font-medium">搜索结果（{hits.length}）</h2>
          {hits.length === 0 ? (
            <EmptyState
              title="我的资料里没有"
              hint="换个词试试。也可能这份资料在同事那里——去「记录」页看看能不能跨人问。"
            />
          ) : (
            <ul className="space-y-2">
              {hits.map((h) => (
                <li
                  key={`${h.itemType}-${h.itemId}`}
                  data-testid="search-hit"
                  className="rounded-xl border border-border bg-card p-3.5"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge variant={h.itemType === "memory" ? "default" : "secondary"}>
                      {h.itemType === "memory" ? "记忆条目" : "文档片段"}
                    </Badge>
                    <span data-testid="hit-source" className="text-xs text-muted-foreground">
                      {h.fileName ?? "（无来源文件）"}
                      {h.pageLabel ? ` · ${h.pageLabel}` : ""}
                    </span>
                    {h.handoverNote && (
                      <span
                        data-testid="hit-handover-note"
                        className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700"
                      >
                        {h.handoverNote}
                      </span>
                    )}
                  </div>
                  {h.title && <p className="text-sm font-medium">{h.title}</p>}
                  <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                    {h.snippet}
                  </p>
                  <div className="mt-1.5 text-[11px] text-muted-foreground/70">
                    融合分 {h.rrfScore.toFixed(4)}
                    {h.trgmScore != null && ` · 模糊 ${h.trgmScore.toFixed(3)}`}
                    {h.vecScore != null && ` · 向量 ${h.vecScore.toFixed(3)}`}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* 文件表格 */}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-medium">我的文件（{files.length}）</h2>
        {loading ? (
          <ListSkeleton />
        ) : files.length === 0 ? (
          <EmptyState
            title="还没有任何资料"
            hint={`把 ${ALLOWED_EXTENSIONS.map((e) => "." + e).join(" / ")} 文件拖到上面的方框里，系统会自动解析、切片并向量化。`}
          />
        ) : (
          <div
            data-testid="file-table"
            className="overflow-hidden rounded-xl border border-border bg-card"
          >
            <table className="bt-table w-full text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 text-left font-medium">文件名</th>
                  <th className="px-4 text-left font-medium">类型</th>
                  <th className="px-4 text-left font-medium">切片</th>
                  <th className="px-4 text-left font-medium">状态</th>
                  <th className="px-4 text-left font-medium">上传时间</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr
                    key={f.id}
                    data-testid="file-row"
                    onClick={() => openFile(f)}
                    className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-4">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{f.originalFilename}</span>
                        {f.viaHandover && (
                          <Badge variant="outline" className="shrink-0 text-[11px]">
                            {f.viaHandover.fromName} 交接
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 text-xs uppercase text-muted-foreground">
                      {f.sourceType}
                    </td>
                    <td className="px-4 text-xs tabular-nums text-muted-foreground">
                      {f.embeddedChunks}/{f.totalChunks}
                    </td>
                    <td className="px-4">
                      <div className="flex items-center gap-2">
                        <StatusBadge f={f} />
                        {!["done", "failed"].includes(f.parseStatus) && (
                          <Progress
                            value={statusProgress(f.parseStatus, f.totalChunks, f.embeddedChunks)}
                            className="h-1 w-16"
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-4 text-xs text-muted-foreground">
                      {new Date(f.uploadedAt).toLocaleDateString("zh-CN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 切片抽屉 */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          data-testid="chunk-drawer"
          className="w-[560px] overflow-y-auto sm:max-w-[560px]"
        >
          <SheetHeader>
            <SheetTitle className="pr-6 text-base">{current?.originalFilename}</SheetTitle>
            <SheetDescription>
              {current?.totalChunks ?? 0} 片 · 每片都保留了它在原文里的位置
            </SheetDescription>
          </SheetHeader>

          {current?.parseError && (
            <div className="mx-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              {current.parseError}
            </div>
          )}

          <div className="space-y-3 px-4 pb-6">
            {chunkLoading ? (
              <ListSkeleton rows={4} />
            ) : chunks.length === 0 ? (
              <EmptyState title="这份文件还没有切片" hint="可能还在处理中，或者解析失败了。" />
            ) : (
              chunks.map((c) => (
                <div
                  key={c.id}
                  data-testid="chunk-item"
                  className="rounded-lg border border-border p-3"
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span
                      data-testid="chunk-source"
                      className="rounded-md bg-accent px-1.5 py-0.5 text-[11px] text-accent-foreground"
                    >
                      {c.pageLabel}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      #{c.chunkIndex + 1} · {c.charCount ?? c.content.length} 字
                      {c.embeddingStatus === "done" ? " · 已向量化" : ""}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/85">
                    {c.content}
                  </p>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
