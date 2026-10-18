import { NextResponse } from "next/server";
import { errorResponse, withUser } from "@/lib/api/guards";
import {
  EXAM_WIZARD_DRAFT_MAX_BYTES,
  draftStarted,
  parseExamWizardDraft,
} from "@/lib/learning/exam-wizard-draft";

/**
 * Kurulum sihirbazı taslağının sunucu kopyası (18 Ekim 2026, plan 2.3): kullanıcı
 * başına tek satır, cihazlar arası "kaldığın yerden devam". Gövde tarayıcıdaki
 * taslakla aynı biçimde ve aynı süzgeçten (`parseExamWizardDraft`) geçer; boş
 * taslak satırı siler. Tablo yoksa ya da veritabanı cevap vermezse uç sessizce
 * "yok" der — sihirbaz tarayıcı kopyasıyla çalışmayı sürdürür.
 */
const TABLE = "exam_wizard_drafts";
const GUARD = { scope: "exam-wizard-draft", limit: 90 };

export async function GET(request: Request) {
  const guard = await withUser(request, GUARD);
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const { data, error } = await service
    .from(TABLE)
    .select("draft")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ draft: null });
  return NextResponse.json({ draft: parseExamWizardDraft(data.draft) });
}

export async function PUT(request: Request) {
  const guard = await withUser(request, GUARD);
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const text = await request.text().catch(() => "");
  if (text.length > EXAM_WIZARD_DRAFT_MAX_BYTES) return errorResponse(413, "draft_too_large");
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    return errorResponse(400, "invalid_input");
  }
  const raw = body && typeof body === "object" ? (body as { draft?: unknown }).draft : null;
  const draft = parseExamWizardDraft(raw);
  if (!draft) return errorResponse(400, "invalid_input");

  if (!draftStarted(draft)) {
    await service.from(TABLE).delete().eq("user_id", userId);
    return NextResponse.json({ ok: true, stored: false });
  }

  const { error } = await service
    .from(TABLE)
    .upsert({ user_id: userId, draft, updated_at: draft.updatedAt }, { onConflict: "user_id" });
  return NextResponse.json({ ok: !error, stored: !error });
}

export async function DELETE(request: Request) {
  const guard = await withUser(request, GUARD);
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  await service.from(TABLE).delete().eq("user_id", userId);
  return NextResponse.json({ ok: true });
}
