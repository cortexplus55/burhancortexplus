import type { ReactNode } from "react";
import { uiV2Static } from "@/lib/ui-v2/flags";
import { UiScope } from "@/lib/ui-v2/scope";
import "@/styles/ui-v2-giris.css";

/**
 * Faz 7A: `ui.v2.giris` açıkken sayfa yeni görünümün sarmalayıcısıyla (kapalıyken DOM aynı). Sayfa durağan kalır, bayrak
 * en geç 60 sn'de bir tazelenir (Faz 12B: dinamik çizim engelleme süresini artırıyordu). Yerel test: `/e2e/giris?ui=v2`.
 */
export const revalidate = 60;

/** Sayfa istemci bileşeni olduğu için başlık burada (6 Kasım 2026: sekmede genel başlık görünüyordu). */
export const metadata = { title: "Şifremi unuttum" };

export default async function Layout({ children }: { children: ReactNode }) {
  return (
    <UiScope keys={(await uiV2Static("giris")) ? ["giris"] : []}>{children}</UiScope>
  );
}
