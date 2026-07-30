// Supabase 客户端（Leo-hub 项目，publishable key + 开放 RLS，单用户站）
// 浏览器端和服务器端共用同一把 publishable key
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_KEY!,
      { auth: { persistSession: false } },
    );
  }
  return client;
}
