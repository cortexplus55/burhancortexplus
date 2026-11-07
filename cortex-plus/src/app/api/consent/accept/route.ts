import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import {
  ageDeclarationSchema,
  ageProblem,
  consentEvidenceSchema,
  consentStatusFrom,
  validReadEvidence,
} from "@/lib/legal/consent-evidence";
import { loadConsentRows, recordSignupConsent } from "@/lib/legal/record-consent";
import { LEGAL_VERSIONS, REQUIRED_CONSENT_KEY, type ConsentType } from "@/lib/legal/versions";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  documents: consentEvidenceSchema.default({}),
  age: ageDeclarationSchema.optional(),
});

/**
 * Onay kapısının kaydı (7 Kasım 2026): metin sürümü değişince ya da onayı hiç kaydedilmemiş eski hesapta öğrenci
 * metinleri okuyup onaylar. Her metnin kanıtı (bugünkü sürüm, sonuna kadar kaydırıldı) sunucuda yeniden doğrulanır;
 * geçersiz kanıt kaydedilmez, öğrenciye ne yapacağı söylenir.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "consent-accept", limit: 20 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { documents, age } = parsed.data;

  if (age) {
    const issue = ageProblem(age);
    if (issue) return NextResponse.json({ error: issue }, { status: 400 });
  }
  for (const [type, evidence] of Object.entries(documents) as [ConsentType, unknown][]) {
    if (!evidence) continue;
    if (!validReadEvidence(documents[type], LEGAL_VERSIONS[type])) {
      return NextResponse.json(
        { error: "Metni yeniden açıp sonuna kadar okuduktan sonra onayla." },
        { status: 400 },
      );
    }
  }

  const result = await recordSignupConsent(service, {
    userId,
    acceptedAt: new Date().toISOString(),
    ip: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
    documents,
    age: age ?? null,
  });
  if (!result.ok) return errorResponse(500, "save_failed");

  const rows = await loadConsentRows(service, userId);
  return NextResponse.json({
    ok: true,
    key: REQUIRED_CONSENT_KEY,
    ...(rows ? consentStatusFrom(rows) : { missing: [], ageNeeded: false, read: [] }),
  });
}
