import type { ReactNode } from "react";
import { uiV2 } from "@/lib/ui-v2/flags";
import { UiScope } from "@/lib/ui-v2/scope";
import "@/styles/ui-v2-studyo.css";

/** Faz 8: `ui.v2.studyo` açıkken stüdyo ekranı yeni görünümün sarmalayıcısıyla (kapalıyken DOM aynı). */
export default async function Layout({ children }: { children: ReactNode }) {
  return <UiScope keys={(await uiV2("studyo")) ? ["studyo"] : []}>{children}</UiScope>;
}
