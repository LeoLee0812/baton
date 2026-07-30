"use client";

// 上传 hook：校验 → 传字节 → 建档 → 轮询推进状态机。
//
// 两个必须记住的约束：
// 1. Vercel Function 请求体上限 4.5MB，所以大文件走 Vercel Blob 客户端直传，绕过自己的函数；
//    拿不到 Blob token 时降级为 inline（≤4MB 文本直接入库）。
// 2. 本地开发收不到 Blob 的 onUploadCompleted 回调（回调不到 localhost），
//    所以建档一律由前端拿到 url 后**显式**调 /api/files，⛔ 不依赖回调。

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/identity";
import { MAX_UPLOAD_BYTES, UploadRejected, statusLabel, validateUpload } from "@/lib/upload";
import type { FileRecord } from "@/lib/types";

const INLINE_LIMIT = 4 * 1024 * 1024;

export function useUpload({ onDone }: { onDone: () => void }) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [percent, setPercent] = useState(0);
  const [stage, setStage] = useState("待处理");
  const running = useRef(false);

  const start = useCallback(
    async (file: File) => {
      if (running.current) {
        toast.warning("上一份还在处理，等它跑完再传下一份");
        return;
      }
      try {
        validateUpload(file.name, file.size);
      } catch (e) {
        if (e instanceof UploadRejected) toast.error(e.message);
        else toast.error(`文件校验失败：${(e as Error).message}`);
        return;
      }

      running.current = true;
      setBusy(true);
      setName(file.name);
      setPercent(5);
      setStage("上传中");

      try {
        let url: string | null = null;
        let inlineContent: string | null = null;

        // 先试 Vercel Blob 直传；没配 Blob store 就降级 inline
        let blobOk = false;
        if (file.size <= MAX_UPLOAD_BYTES) {
          try {
            const probe = await fetch("/api/blob/upload", { method: "GET" });
            blobOk = probe.ok && (await probe.json()).enabled === true;
          } catch {
            blobOk = false;
          }
        }

        if (blobOk) {
          const { upload } = await import("@vercel/blob/client");
          const blob = await upload(`baton/${Date.now()}-${file.name}`, file, {
            access: "public",
            handleUploadUrl: "/api/blob/upload",
            multipart: file.size > 10 * 1024 * 1024,
            onUploadProgress: ({ percentage }) => setPercent(Math.min(35, percentage * 0.35)),
          });
          url = blob.url;
        } else {
          if (file.size > INLINE_LIMIT) {
            throw new Error(
              "没有配置 Vercel Blob，当前只能收 4MB 以内的文件。请先在 Vercel 上建 Blob store。",
            );
          }
          // 二进制格式统一走 base64，服务端再还原；纯文本直接读字符串
          const isText = /\.(txt|md)$/i.test(file.name);
          inlineContent = isText
            ? await file.text()
            : Buffer.from(await file.arrayBuffer()).toString("base64");
          setPercent(30);
        }

        const created = await apiFetch<{ file: FileRecord }>("/api/files", {
          method: "POST",
          body: JSON.stringify({
            filename: file.name,
            size: file.size,
            mimeType: file.type,
            url,
            inlineContent,
          }),
        });

        // 轮询驱动分步处理：每次只做一小块，天然支持断点续传
        let fileState = created.file;
        let guard = 0;
        while (!["done", "failed"].includes(fileState.parseStatus) && guard < 120) {
          guard += 1;
          const r = await apiFetch<{ file: FileRecord }>(`/api/files/${fileState.id}/step`, {
            method: "POST",
          });
          fileState = r.file;
          setStage(statusLabel(fileState.parseStatus, fileState.totalChunks));
          setPercent(
            fileState.totalChunks > 0
              ? 35 + Math.round((fileState.embeddedChunks / fileState.totalChunks) * 60)
              : 45,
          );
          onDone();
          await new Promise((res) => setTimeout(res, 300));
        }

        if (fileState.parseStatus === "failed") {
          toast.error(fileState.parseError ?? "处理失败");
        } else {
          setPercent(100);
          setStage("已入库");
          toast.success(`《${file.name}》已入库，共 ${fileState.totalChunks} 片`);
        }
      } catch (e) {
        toast.error(`上传失败：${(e as Error).message}`);
      } finally {
        running.current = false;
        setBusy(false);
        onDone();
      }
    },
    [onDone],
  );

  return {
    dragging,
    setDragging,
    busy,
    name,
    percent,
    stage,
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) void start(f);
    },
    onPick: (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) void start(f);
      e.target.value = "";
    },
  };
}
