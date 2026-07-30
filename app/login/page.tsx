// 登录页：站点唯一对陌生人开放的页面，只有一个密码框，不泄露任何内容。
// 自包含（纯内联样式，不依赖 UI 库），可原样放进任何 Next 项目。

"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
    <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 340 }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div
          style={{
            width: 56,
            height: 56,
            margin: "0 auto 16px",
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(99,102,241,0.12)",
            fontSize: 26,
          }}
          aria-hidden
        >
          🔒
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>需要访问密码</h1>
        <p style={{ fontSize: 14, opacity: 0.6, marginTop: 8 }}>
          私人站点，请输入密码进入
        </p>
      </div>

      <input
        autoFocus
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="访问密码"
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid rgba(128,128,128,0.35)",
          background: "transparent",
          color: "inherit",
          fontSize: 14,
          outline: "none",
        }}
      />

      {error && (
        <p style={{ color: "#ef4444", fontSize: 13, textAlign: "center", marginTop: 10 }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        style={{
          width: "100%",
          marginTop: 12,
          padding: "11px 14px",
          borderRadius: 12,
          border: "none",
          background: loading ? "rgba(99,102,241,0.5)" : "rgb(99,102,241)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "验证中…" : "进入"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
