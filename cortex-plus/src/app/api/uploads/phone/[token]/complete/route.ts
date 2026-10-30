import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { guestLimit } from "@/lib/api/guards";
import { completeDocumentUpload } from "@/lib/documents/complete-upload";
import { appendPhoneUpload } from "@/lib/documents/phone-session";
import { openPhoneSession } from "@/lib/documents/phone-session-guard";

/*
  Telefondan imzalı yükleme, 2. adım (31 Ekim 2026): dosya depoda doğrulanır (masaüstüyle aynı denetim), sonra
  oturuma eklenir; masaüstü sekmesi yoklarken görür. Yalnız oturum sahibinin, bu uçla hazırlanmış belgesi.
*/
const bodySchema = z.object({ documentId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = await guestLimit(request, {
    scope: "phone-upload",
    limit: 120,
    signal: "token_bruteforce",
    severity: "medium",
  });
  if (limited) return limited;
  const { token } = await params;
  const service = createServiceClient();
  const session = await openPhoneSession(service, request, token, "phone-upload");
  if (!session.ok) return session.response;
  const { row } = session;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const completed = await completeDocumentUpload(service, row.user_id, parsed.data.documentId);
  if (!completed.ok) return NextResponse.json({ error: completed.error }, { status: completed.status });
  if ((row.document_ids ?? []).includes(completed.documentId)) {
    return NextResponse.json({ ok: true, documentId: completed.documentId, fileName: completed.fileName });
  }
  const appended = await appendPhoneUpload(service, row, completed.documentId, completed.fileName);
  if (!appended) return NextResponse.json({ error: "used" }, { status: 409 });
  return NextResponse.json({ ok: true, documentId: completed.documentId, fileName: completed.fileName });
}
