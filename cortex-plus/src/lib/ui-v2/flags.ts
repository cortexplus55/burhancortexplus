import "server-only";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { isFeatureEnabled } from "@/lib/admin/feature-flags";

/*
  Yeni görünüm bayrakları (`ui.v2.<ekran>`, ANA-PROMPT §5.4). Önizlemede açık, canlıda kapalı; canlıda Özellik
  Anahtarları'ndaki `ui.v2.<ekran>` satırı açar (pilot kullanıcı listesi de çalışır). Bayrak KAPALIYKEN sayfa eskisiyle
  aynı DOM'u çizer: yeni görünüm yalnız sayfanın açıkken eklediği `data-ui` sarmalayıcısının altında CSS ile gelir,
  davranış kodu ortak (kopya mantık yok).

  Yerel test sunucusunda (VERCEL_ENV yok) `UI_V2=all|ders,tekrar` ortam değişkeni ya da `cx-ui-v2` çerezi açar: görsel
  taban "-v2" görüntüleri aynı sunucudan çekilir. Çerez canlıda (VERCEL_ENV=production) yok sayılır.
*/

export const UI_V2_KEYS = [
  "ders",
  "tekrar",
  "ogretmen",
  "giris",
  "kurulum",
  "pay",
  "studyo",
  "duello",
  "paylas",
  "ayarlar",
  "kutuphane",
  "araclar2",
  "buyume",
] as const;
export type UiV2Key = (typeof UI_V2_KEYS)[number];

function listed(value: string | undefined, key: UiV2Key): boolean {
  if (!value) return false;
  const items = value.split(",").map((item) => item.trim());
  return items.includes("all") || items.includes(key);
}

export async function uiV2(key: UiV2Key, userId?: string | null): Promise<boolean> {
  const env = process.env.VERCEL_ENV;
  if (env === "production") {
    return isFeatureEnabled(createServiceClient(), `ui.v2.${key}`, userId ?? null).catch(() => false);
  }
  if (env === "preview") return true;
  if (listed(process.env.UI_V2, key)) return true;
  try {
    return listed((await cookies()).get("cx-ui-v2")?.value, key);
  } catch {
    return false;
  }
}
