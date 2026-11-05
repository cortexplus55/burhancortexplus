import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
  Lansman zırhı #3 (5 Kasım 2026): telif güvenli paylaşım. Öğrenci hazırlığını sınıf grubuyla (ya da okul
  ağıyla) paylaşınca katılana yalnız konu haritası ve yol kopyalanır; ilk öğrencinin yüklediği dosya (Storage
  nesnesi, sayfa metinleri, gömmeler, belge kimlikleri) başka hesaba AÇILMAZ. Bu dosya o sınırı bekler:
  çatallar belge alanı taşımaz, belge uçları sahipliği denetler, RLS belgeyi sahibine kilitler.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const DOC_FIELDS = /document_id|source_document_ids|storage_path|document_topic_node|source_refs|sha256/;

describe("çatallar belge taşımaz", () => {
  it("sınıf grubu daveti: hazırlık satırında ve konu kopyasında belge alanı yok", () => {
    const store = read("src/lib/learning/prep-invite-store.ts");
    const insert = store.slice(store.indexOf(".from(\"exam_preps\")\n    .insert({"), store.indexOf('.select("id")\n    .single();'));
    expect(insert).toContain("forked_from: source.id");
    expect(insert).not.toMatch(DOC_FIELDS);
    expect(store).toContain('.select("label, sort_order")');
    const topicInsert = store.slice(store.indexOf('.from("exam_prep_topics")\n      .insert('), store.indexOf("awardStars("));
    expect(topicInsert).not.toMatch(DOC_FIELDS);
    // Davet kaynağı da belge okumaz.
    const sourceSelect = store.slice(store.indexOf("export async function loadInviteSource"), store.indexOf("export async function findJoinedCopy"));
    expect(sourceSelect).not.toMatch(/storage_path|document_pages|document_chunks/);
  });

  it("okul ağı katılımı: aynı sınır", () => {
    const route = read("src/app/api/school/route.ts");
    const forkInsert = route.slice(route.indexOf(".insert({"), route.indexOf("forked_from: source.id") + 24);
    expect(forkInsert).not.toMatch(DOC_FIELDS);
  });

  it("davet açılış sayfası ve davet metni belgeye dokunmaz", () => {
    const page = read("src/app/hazirlik-davet/[token]/page.tsx");
    expect(page).not.toMatch(/storage_path|document_pages|createSignedUrl|from\("documents"\)/);
    const share = read("src/lib/learning/prep-share.ts");
    expect(share).toContain("senin sonuçların paylaşılmaz");
    expect(share).not.toMatch(/document/i);
  });
});

describe("belge uçları sahipliği denetler", () => {
  it("sayfa önizlemesi, belge sayfası, sohbet görseli ve işleme ucu: belge sahibi değilse 404/403", () => {
    const preview = read("src/app/api/documents/[documentId]/page-preview/route.ts");
    expect(preview).toContain("doc.user_id !== userId");
    expect(preview.indexOf("doc.user_id !== userId")).toBeLessThan(preview.indexOf("createSignedUrl("));
    const docPage = read("src/app/dokumanlar/[documentId]/page.tsx");
    expect(docPage).toContain("doc.user_id !== user.id) notFound()");
    const chat = read("src/app/api/ai/chat/route.ts");
    expect(chat).toContain('.eq("user_id", userId).is("deleted_at", null).maybeSingle()');
    expect(chat).toContain("isOwnedDocumentPath(doc.storage_path, userId, rest.imageDocumentId)");
    const process = read("src/app/api/documents/process/route.ts");
    expect(process).toContain('if (doc.user_id !== userId) return errorResponse(403, "forbidden");');
  });

  it("hazırlık ve düğüm sayfaları yalnız sahibine açılır (kaynak kartı ve şekil sayfası oradan geçer)", () => {
    const prep = read("src/app/deneme-sinavlari/[prepId]/page.tsx");
    expect(prep).toMatch(/\.eq\("id", prepId\)\s*\.eq\("user_id", user\.id\)/);
    expect(prep).toContain("if (!prep) notFound();");
    const node = read("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx");
    expect(node).toContain('.eq("user_id", user.id)');
    expect(node).toContain("if (!prep || !node) notFound();");
  });

  it("tekilleştirme kaynağı asla görünmez: kopya öğrencinin kendi belgesidir, kaynak kimliği yalnız günlükte", () => {
    const dedup = read("src/lib/documents/document-dedup.ts");
    expect(dedup).toContain("sha256Hex(buffer: Buffer | Uint8Array)");
    expect(dedup).toMatch(/istemcinin söylediği\s+özete güvenilmez/);
    const pipeline = read("src/lib/rag/pipeline.ts");
    expect(pipeline).toContain("const sha256 = sha256Hex(buffer);");
    expect(pipeline).not.toMatch(/body\.sha256|input\.sha256|clientSha/);
    const pdf = read("src/lib/documents/pdf-ingestion.ts");
    expect(pdf).toContain("const sha256 = sha256Hex(buffer);");
  });
});

describe("RLS ve depolama", () => {
  it("belge, sayfa, parça ve gömme satırları sahibine; depolama kovası özel, okuma koruması açık", () => {
    const migrations = readdirSync("supabase/migrations")
      .filter((name) => name.endsWith(".sql"))
      .map((name) => read(join("supabase/migrations", name)))
      .join("\n");
    expect(migrations).toMatch(/CREATE POLICY docs_own ON public\.documents FOR ALL USING \(user_id = auth\.uid\(\)\)/);
    expect(migrations).toMatch(/CREATE POLICY doc_pages_own ON public\.document_pages/);
    expect(migrations).toMatch(/CREATE POLICY doc_chunks_own ON public\.document_chunks/);
    expect(migrations).toMatch(/CREATE POLICY doc_embeddings_own ON public\.document_embeddings/);
    expect(migrations).toMatch(/CREATE POLICY documents_private_read_guard ON storage\.objects/);
    expect(migrations).toMatch(/CREATE POLICY documents_storage_select ON storage\.objects/);
    // Klon fonksiyonu yalnız service_role: kopya sunucuda, kullanıcı anahtarıyla çağrılamaz.
    expect(migrations).toMatch(/revoke all on function public\.clone_document_content\(uuid, uuid\) from public, anon, authenticated/);
  });
});
