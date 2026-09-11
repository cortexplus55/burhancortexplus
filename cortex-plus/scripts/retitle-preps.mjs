// Başlığı bozuk kalmış hazırlıkların adını belgeden yeniden üretir.
//
// Varsayılan KURU çalıştırma: ne olacağını yazar, hiçbir şey değiştirmez.
// Uygulamak için: --apply
//
// Kural `documentTitle` — intake rotasının kullandığı fonksiyonun kendisi,
// kopyası değil. Girdiler de aynı: yalnızca KAPAK sayfasının başlıkları
// (içindekiler sayfasının başlığı belgenin adı değildir), konu başlıkları
// ve dosya adı.
import { createServer } from "vite";
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");

const server = await createServer({
  configFile: "vitest.config.ts",
  server: { middlewareMode: true },
});
try {
  if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname !== "dgjfyewgrukglsehyntc.supabase.co") {
    throw new Error("wrong_project");
  }
  const { documentTitle } = await server.ssrLoadModule("/src/lib/documents/topic-title.ts");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });

  // Belgeden gelmeyen, içindekiler sayfasından kapılmış adlar.
  const BOZUK = /^(öğrenme hedefleri|i̇çindekiler|içindekiler|konular|kazanımlar)$/i;

  const { data: preps } = await db
    .from("exam_preps")
    .select("id, user_id, title, document_id")
    .order("created_at", { ascending: false });

  const hedef = (preps ?? []).filter((p) => BOZUK.test((p.title ?? "").trim()));
  console.log(`Başlığı bozuk hazırlık: ${hedef.length}${apply ? "" : "  (KURU ÇALIŞTIRMA)"}`);

  for (const prep of hedef) {
    if (!prep.document_id) {
      console.log(`  ${prep.id.slice(0, 8)}  "${prep.title}" → belgesi yok, atlandı`);
      continue;
    }
    const [{ data: doc }, { data: pages }, { data: topics }] = await Promise.all([
      db.from("documents").select("file_name").eq("id", prep.document_id).maybeSingle(),
      db.from("document_pages").select("page_number, page_kind, headings")
        .eq("document_id", prep.document_id).order("page_number", { ascending: true }).limit(2),
      db.from("exam_prep_topics").select("label").eq("exam_prep_id", prep.id).order("sort_order"),
    ]);
    const cover = (pages ?? []).filter((p) => p.page_kind === "cover");
    const yeni = documentTitle({
      coverHeadings: cover.flatMap((p) => p.headings ?? []),
      topicTitles: (topics ?? []).map((t) => t.label).filter(Boolean),
      fileName: doc?.file_name ?? null,
    });

    if (!yeni || yeni === prep.title) {
      console.log(`  ${prep.id.slice(0, 8)}  "${prep.title}" → üretilemedi, DOKUNULMADI`);
      continue;
    }
    console.log(`  ${prep.id.slice(0, 8)}  "${prep.title}" → "${yeni}"  (dosya: ${doc?.file_name ?? "-"})`);
    if (apply) {
      const { error } = await db.from("exam_preps").update({ title: yeni }).eq("id", prep.id);
      console.log(error ? `      YAZILAMADI: ${error.message}` : "      yazıldı");
    }
  }
  if (!apply) console.log("\nUygulamak için: --apply");
} finally {
  await server.close();
}
