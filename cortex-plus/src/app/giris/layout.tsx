import type { ReactNode } from "react";
import { uiV2Static } from "@/lib/ui-v2/flags";
import { UiScope } from "@/lib/ui-v2/scope";
import { pageMetadata } from "@/lib/seo/page-metadata";
import "@/styles/ui-v2-giris.css";

/**
 * Sayfa istemci bileşeni olduğu için başlık, kanonik adres ve paylaşım bilgisi burada (26 Kasım 2026). Önceden
 * `/giris` ana sayfanın başlığını ve paylaşım adresini taşıyordu.
 */
export const metadata = pageMetadata({
  title: "Giriş yap",
  description: "Cortex Plus hesabına e-posta ya da Google ile giriş yap; sınav hazırlığına kaldığın yerden devam et.",
  path: "/giris",
});

/**
 * Faz 7A: `ui.v2.giris` açıkken sayfa yeni görünümün sarmalayıcısıyla (kapalıyken DOM aynı). Sayfa durağan kalır, bayrak
 * en geç 60 sn'de bir tazelenir (Faz 12B: dinamik çizim engelleme süresini artırıyordu). Yerel test: `/e2e/giris?ui=v2`.
 */
export const revalidate = 60;

export default async function Layout({ children }: { children: ReactNode }) {
  return (
    <UiScope keys={(await uiV2Static("giris")) ? ["giris"] : []}>{children}</UiScope>
  );
}
