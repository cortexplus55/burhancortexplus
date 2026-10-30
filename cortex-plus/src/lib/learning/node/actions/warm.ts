/** `action: "warm"`: ders düğümünde önceden yazım arkada başlar (ısınma). */
import "server-only";
import { NextResponse } from "next/server";
import { requestNodePrefetch } from "@/lib/learning/lesson-prefetch";
import { afterResponse } from "@/lib/learning/node/shared";
import type { NodeContext } from "@/lib/learning/node/context";

// Isınma (19 Ekim 2026, adım 3 "soğuk ders 10 sn"): öğrenci ders düğümünü açıp ruh hali
// ekranına gelince yazım arka planda hızlı işlemle başlar; "Ders oluştur" basılınca yazımı süren
// ders devralınır (peekBuildingPrefetch). Öğrenci kartlarda geçirdiği 5-10 sn'yi yazıma kazandırır.
export async function warmAction(context: NodeContext): Promise<NextResponse> {
  const { userId, service, options, prepId, teachingV2, node, kind } = context;
  const warmable = kind === "lesson" && teachingV2;
  if (warmable) {
    afterResponse(() =>
      requestNodePrefetch(
        service,
        {
          origin: options.origin,
          userId,
          prepId,
          node: { id: node.id as string, kind: node.kind as string, status: (node.status as string | null) ?? null, session_meta: node.session_meta },
        },
        { warm: true },
      ),
    );
  }
  return NextResponse.json({ ok: true, warming: warmable });
}
