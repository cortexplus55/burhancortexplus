import { NextResponse } from "next/server";
import { supabaseConfigIssue } from "@/lib/supabase/config-check";
import { schemaMatchesCode } from "@/lib/admin/schema-probe";

export const dynamic = "force-dynamic";

/** Canlı ortam Supabase yapılandırmasını doğrula (anahtar sızdırmaz). */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const refMatch = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  const projectRef = refMatch?.[1] ?? null;
  const issue = supabaseConfigIssue();

  /*
    Şema kontrolü buraya 19 Eylül 2026'da eklendi.

    Bir gün önce bu dal yayına çıktı ve "göç dosyaları uygulandı mı" sorusu
    dışarıdan cevaplanamadı: sayfa açılıyor, sitemap 200, burası "ok" diyordu
    — ama `credit_reserve` eski imzada kalmışsa her kredi ayırma isteği
    düşüyor. En pahalı arıza, en sessiz görünen arızaydı.

    Yalnızca boolean dönüyor; hangi tablonun eksik olduğu herkese açık bir
    uçta gereksiz bilgi. Ayrıntı `/admin/sistem`'de. `null` "bilmiyorum"
    demek — service anahtarı yoksa yanlış alarm vermektense susuyoruz.
  */
  const schemaOk = await schemaMatchesCode();

  return NextResponse.json({
    ok: !issue && schemaOk !== false,
    supabaseProjectRef: projectRef,
    expectedRef: "dgjfyewgrukglsehyntc",
    issue,
    schemaOk,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
  });
}
