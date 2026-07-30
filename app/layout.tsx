import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "接棒 Baton · 知识交接工作台",
  description:
    "给小公司每人配一个 Agent 管住自己的资料，离职换岗一键把该给的交出去。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* 所有 API 错误都走 Sonner toast，⛔ 不许静默失败（AC-7.3.1） */}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
