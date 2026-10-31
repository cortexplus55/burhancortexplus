import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { attachDocumentsToPrep } from "@/lib/learning/prep-attach";
import { PREP_DOCUMENT_REQUEST_MAX } from "@/lib/learning/prep-topic-list";

/*
  Toplu ekleme (31 Ekim 2026, ürün sahibi: "kullanıcı sonradan da istediği kadar döküman yükleyebilir"). Önce tek
  dosya ve hazırlık başına en çok 8 dosyaydı; 100 fotoğrafı sonradan eklemek 100 istek (dakikada 12 sınırı) ve 100
  ayrı konu haritası demekti. Şimdi seçilen bütün dosyalar tek istekte: tek planla eklenir. Eski istemci (tek
  `documentId`) aynen çalışır. Belge sayısında ürün sınırı yok; sayfa, fotoğraf ve kredi hakkı sınırlar.
  Ekleme işi `attachDocumentsToPrep`'te (büyük belgenin pencere işçisi de aynı yoldan ekler).
*/
const bodySchema = z
  .object({
    prepId: z.string().uuid(),
    documentId: z.string().uuid().optional(),
    documentIds: z.array(z.string().uuid()).min(1).max(PREP_DOCUMENT_REQUEST_MAX).optional(),
  })
  .refine((body) => Boolean(body.documentId || body.documentIds?.length));

export const maxDuration = 300;

/**
 * Var olan hazırlığa yeni dosya.
 * Yalnızca bu dosyanın saklı analizi okunur; eski dosyalar yeniden üretilmez.
 * Bitmiş düğüm, puan ve hazırlık skoru yazılmaz.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-add-source", limit: 12 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const documentIds = [...new Set([...(parsed.data.documentIds ?? []), ...(parsed.data.documentId ? [parsed.data.documentId] : [])])];

  const result = await attachDocumentsToPrep(service, { userId, prepId: parsed.data.prepId, documentIds });
  if (!result.ok) return errorResponse(result.status, result.code);
  const { ok: _ok, ...payload } = result;
  void _ok;
  return NextResponse.json({ ok: true, ...payload });
}
