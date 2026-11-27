import { createClient } from "@supabase/supabase-js";

/**
 * Herkese açık veriyi (plan fiyatları) okuyan çerezsiz, oturumsuz istemci (2 Kasım 2026, O12; 27 Kasım 2026'da ortak).
 * `cookies()` okumadığı için sayfa ve uç önbellekten gelebilir. Yalnız yayımlanabilir anahtar; satır güvenliği geçerli.
 */
export function createPublicReadClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
