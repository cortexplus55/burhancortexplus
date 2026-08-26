const DEPRECATED_PROJECT_REFS = ["gwqonggqzvavljguiryx", "placeholder"];

/** Greenfield Supabase (docs/delivery/GREENFIELD-CONNECT.md) */
export const EXPECTED_SUPABASE_PROJECT_REF = "dgjfyewgrukglsehyntc";

export function supabaseConfigIssue(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";

  if (!url || !key || url.includes("placeholder") || key.includes("placeholder")) {
    return "Supabase anahtarları eksik. NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ayarlanmalı.";
  }

  for (const ref of DEPRECATED_PROJECT_REFS) {
    if (url.includes(ref)) {
      return `Eski Supabase projesi kullanılıyor (${ref}). Yeni proje: ${EXPECTED_SUPABASE_PROJECT_REF}. Vercel ve .env.local güncellenmeli.`;
    }
  }

  if (!url.includes(EXPECTED_SUPABASE_PROJECT_REF)) {
    return `Supabase URL beklenen proje ile uyuşmuyor (${EXPECTED_SUPABASE_PROJECT_REF}).`;
  }

  return null;
}
