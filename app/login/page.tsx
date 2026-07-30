// 登录页：站点唯一对陌生人开放的页面，只有一个密码框，不泄露任何内容。
// 逻辑照抄 english-daily 的统一密码门，样式改成 Baton 的浅色干净风。

"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Handshake, Lock } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `登录失败（${res.status}）`);
      }
      const next = params.get("next");
      const dest = next && next.startsWith("/") ? next : "/";
      router.replace(dest);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setPassword("");
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-[360px] rounded-2xl border border-border bg-card p-8"
    >
      <div className="mb-7 text-center">
        <div
          className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground"
          aria-hidden
        >
          <Handshake className="size-6" />
        </div>
        <h1 className="text-lg font-semibold">接棒 Baton</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          私人站点，请输入统一访问密码进入
        </p>
      </div>

      <label htmlFor="bt-password" className="mb-1.5 block text-xs text-muted-foreground">
        访问密码
      </label>
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id="bt-password"
          autoFocus
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="请输入访问密码"
          className="w-full rounded-lg border border-border bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary"
        />
      </div>

      {error && (
        <p role="alert" className="mt-2.5 text-center text-xs text-destructive">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "验证中…" : "进入"}
      </button>

      <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground">
        给小公司每人配一个 Agent 管住自己的资料
        <br />
        离职换岗，一键把该给的交出去
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-5">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
