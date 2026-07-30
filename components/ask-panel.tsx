"use client";

// 问 Agent 面板：先问自己的资料；查不到时可以指定一位同事，问他的 Agent。
// 跨人只能问到对方开了「同事可问到」开关的记忆条目，且只允许一跳（SPEC-006）。

import { useState } from "react";
import { toast } from "sonner";
import { MessageCircleQuestion, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/identity";
import type { Employee } from "@/lib/types";

interface AskResponse {
  answer: string;
  citations: Array<{ label: string; itemType: string; itemId: string; snippet: string }>;
  crossEmployee: boolean;
  targetName: string | null;
  hop: number;
  latencyMs: number;
}

export function AskPanel({
  colleagues,
  onAnswered,
}: {
  colleagues: Employee[];
  onAnswered?: () => void;
}) {
  const [q, setQ] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<AskResponse | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try {
      const r = await apiFetch<AskResponse>("/api/ask", {
        method: "POST",
        body: JSON.stringify({ question: q.trim(), askColleagueCode: target || null }),
      });
      setRes(r);
      onAnswered?.();
    } catch (err) {
      toast.error(`提问失败：${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      data-testid="ask-panel"
      className="rounded-xl border border-border bg-card p-4"
    >
      <h2 className="mb-2.5 flex items-center gap-1.5 text-sm font-medium">
        <MessageCircleQuestion className="size-4 text-primary" />
        问我的 Agent
      </h2>

      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          data-testid="ask-input"
          placeholder="比如：宏远建材的账期是多久？"
          className="min-w-64 flex-1"
        />
        <select
          data-testid="ask-target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="rounded-lg border border-border bg-card px-2.5 text-xs"
        >
          <option value="">只问我自己的资料</option>
          {colleagues.map((c) => (
            <option key={c.employeeCode} value={c.employeeCode}>
              问 {c.displayName} 的 Agent
            </option>
          ))}
        </select>
        <Button type="submit" disabled={busy} data-testid="ask-btn">
          <Sparkles className="size-4" />
          {busy ? "思考中" : "提问"}
        </Button>
      </form>

      {res && (
        <div data-testid="ask-answer" className="mt-3 rounded-lg bg-accent/40 p-3.5">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            {res.crossEmployee ? (
              <Badge className="text-[11px]">来自 {res.targetName} 的 Agent</Badge>
            ) : (
              <Badge variant="secondary" className="text-[11px]">
                我的资料
              </Badge>
            )}
            <span className="text-[11px] text-muted-foreground">
              hop {res.hop} · {res.latencyMs}ms · 依据 {res.citations.length} 条
            </span>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{res.answer}</p>
          {res.citations.length > 0 && (
            <ul className="mt-2.5 space-y-1">
              {res.citations.map((c) => (
                <li
                  key={`${c.itemType}-${c.itemId}`}
                  data-testid="ask-citation"
                  className="text-[11px] leading-relaxed text-muted-foreground"
                >
                  <span className="rounded bg-white px-1 py-0.5">{c.label}</span>{" "}
                  <span className="line-clamp-1">{c.snippet}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
        问同事的 Agent 时，只会问到对方开了「同事可问到」开关的条目，且只允许一跳，全程留痕在「记录」页。
      </p>
    </section>
  );
}
