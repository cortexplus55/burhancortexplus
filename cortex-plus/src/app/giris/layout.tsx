import type { ReactNode } from "react";
import { uiV2 } from "@/lib/ui-v2/flags";
import { UiScope } from "@/lib/ui-v2/scope";
import "@/styles/ui-v2-giris.css";

/** Faz 7A: `ui.v2.giris` açıkken sayfa yeni görünümün sarmalayıcısıyla (kapalıyken DOM aynı). Bayrak istek anında okunur. */
export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: ReactNode }) {
  return (
    <UiScope keys={(await uiV2("giris")) ? ["giris"] : []}>{children}</UiScope>
  );
}
