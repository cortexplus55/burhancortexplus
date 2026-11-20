import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/guards";
import { freeFirstLessonUsed } from "@/lib/billing/first-lesson-cycle";

/*
  Hazırlık silme onayının ek satırı (21 Kasım 2026): ücretsiz hesap süresiz ilk dersini kullandıysa silip yeniden
  kurduğu hazırlıkta dersler Plus ister; onay penceresi bunu söyler. Yalnız okur; pencere açılınca bir kez sorulur ki
  Sınavlar ve hazırlık sayfasının sorgu bütçesi değişmesin. Okuma düşerse uyarı çıkmaz (yanlış yere çıkmasın).
*/
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-delete-note", limit: 30 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const freeLessonUsed = await freeFirstLessonUsed(service, userId).catch(() => false);
  return NextResponse.json({ freeLessonUsed });
}
