import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { phoneUploadLimit } from "@/lib/api/guards";
import { recordAbuse } from "@/lib/abuse/record";
import { isPremiumUser } from "@/lib/ai/generate";
import { storeUserDocument } from "@/lib/documents/store-upload";
import { fitsInQuota, storageUsage } from "@/lib/documents/storage-quota";
import { appendPhoneUpload, phoneSessionOpen, type PhoneSessionRow } from "@/lib/documents/phone-session";

/**
 * Telefondan yükleme — tek uçtaki tek girişsiz kapı.
 *
 * Kimlik yerine bağlantıdaki koda bakıyor. Kod 16 rastgele bayt, yani
 * deneyerek bulunacak bir şey değil; buradaki sınırın işi kod aramayı
 * durdurmak değil, girişi olmayan bir ucun veritabanını ve depolamayı
 * bedavaya çalıştırmasını engellemek.
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  // Masaüstü sayfası bu ucu "telefon yükledi mi" diye yokluyor, o yüzden
  // sınır cömert.
  const { token } = await params;
  const limited = await phoneUploadLimit(request, token, { scope: "phone-upload-poll", limit: 60 });
  if (limited) return limited;

  const service = createServiceClient();
  // `*`: çok dosya sütunları (göç 20261031120000) yoksa da okunur.
  const { data } = await service
    .from("phone_upload_sessions")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ valid: false, reason: "not_found" }, { status: 404 });
  }
  const row = data as PhoneSessionRow;
  const state = phoneSessionOpen(row);
  if (!state.open) return NextResponse.json({ valid: false, reason: state.reason });
  return NextResponse.json({ valid: true, received: row.document_ids?.length ?? 0, many: Array.isArray(row.document_ids) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  // Çok dosya (31 Ekim 2026): bir öğrenci telefondan art arda onlarca fotoğraf gönderir; kodu deneyerek bulmak
  // yine olanaksız (16 rastgele bayt), sınırın işi girişsiz ucu bedava çalıştırmayı durdurmak.
  const { token } = await params;
  const limited = await phoneUploadLimit(request, token, { scope: "phone-upload", limit: 120 });
  if (limited) return limited;

  const service = createServiceClient();
  const { data: session } = await service
    .from("phone_upload_sessions")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!session) {
    void recordAbuse({
      signal: "token_bruteforce",
      severity: "medium",
      scope: "phone-upload",
      request,
      metadata: { reason: "unknown_token" },
    });
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const row = session as PhoneSessionRow & { id: string; user_id: string };
  const state = phoneSessionOpen(row);
  if (state.reason === "expired") return NextResponse.json({ error: "expired" }, { status: 410 });
  if (!state.open) return NextResponse.json({ error: "used" }, { status: 409 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "invalid_file" }, { status: 400 });
  }

  // Dosya oturum sahibinin alanına yazılıyor; onun tavanı da burada geçerli.
  const isPremium = await isPremiumUser(service, row.user_id);
  const usage = await storageUsage(service, row.user_id, isPremium);
  if (!fitsInQuota(usage, file.size)) {
    return NextResponse.json({ error: "storage_full" }, { status: 413 });
  }

  const stored = await storeUserDocument(service, row.user_id, file);
  if (!stored.ok) {
    return NextResponse.json({ error: stored.error }, { status: 400 });
  }

  const appended = await appendPhoneUpload(service, row, stored.documentId, stored.fileName);
  if (!appended) {
    return NextResponse.json({ error: "used" }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    documentId: stored.documentId,
    fileName: stored.fileName,
  });
}
