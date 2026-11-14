import type { ReactNode } from "react";
import { uiV2 } from "@/lib/ui-v2/flags";
import { UiScope } from "@/lib/ui-v2/scope";
import "@/styles/ui-v2-araclar2.css";

/** Faz 11: `ui.v2.araclar2` açıkken sayfa yeni görünümün sarmalayıcısıyla (kapalıyken DOM aynı). */
export default async function Layout({ children }: { children: ReactNode }) {
  return <UiScope keys={(await uiV2("araclar2")) ? ["araclar2"] : []}>{children}</UiScope>;
}
