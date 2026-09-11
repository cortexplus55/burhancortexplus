// Üretilmiş derslerin kalite karnesi — OKUR, hiçbir şey üretmez veya yazmaz.
//
// Çalıştırma: node --env-file=.env.local scripts/probe-lesson-quality.mjs [prepId]
// prepId verilmezse bütün hazırlıklara bakar.
//
// Bugün her düzeltme elle doğrulandı: bir ders üret, veritabanından oku,
// bölümlerine bak, çizimini say, formülünü kaynakla karşılaştır. Aynı işi
// dört kez yaptıktan sonra betiğe çevirmek doğru olan.
//
// Ölçüler kodun KENDİ doğrulayıcıları — kopyası değil. Bir kural değişirse
// karne de onunla değişir; burada ikinci bir doğru tanımı tutulmuyor.
import { createServer } from "vite";
import { createClient } from "@supabase/supabase-js";

const only = process.argv[2];

const server = await createServer({
  configFile: "vitest.config.ts",
  server: { middlewareMode: true },
});
try {
  if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname !== "dgjfyewgrukglsehyntc.supabase.co") {
    throw new Error("wrong_project");
  }
  const std = await server.ssrLoadModule("/src/lib/learning/teaching-standards.ts");
  const title = await server.ssrLoadModule("/src/lib/documents/topic-title.ts");
  const diag = await server.ssrLoadModule("/src/lib/learning/lesson-diagram.ts");
  const formula = await server.ssrLoadModule("/src/lib/learning/formula-fidelity.ts");

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });

  let q = db.from("exam_preps").select("id, title, document_id").order("created_at", { ascending: false });
  if (only) q = q.eq("id", only);
  const { data: preps } = await q;

  const toplam = {
    eskiDers: 0,
    ders: 0,
    pedagoji: 0,
    sablonBaslik: 0,
    cizimEksik: 0,
    cizimZayif: 0,
    formulUydurma: 0,
    bolumAtlama: 0,
  };
  const bulgular = [];

  for (const prep of preps ?? []) {
    const { data: lessons } = await db
      .from("exam_prep_lessons")
      .select("id, topic_id, title, content_json, created_at")
      .eq("exam_prep_id", prep.id)
      .order("created_at", { ascending: false });
    if (!lessons?.length) continue;

    // Aynı konunun birden çok dersi varsa en yenisi ölçülür.
    const enYeni = new Map();
    for (const l of lessons) if (!enYeni.has(l.topic_id)) enYeni.set(l.topic_id, l);

    for (const lesson of enYeni.values()) {
      const v = lesson.content_json;
      if (!v?.sections) continue;
      toplam.ders += 1;
      /**
       * KURALDAN ÖNCE Mİ SONRA MI ÜRETİLDİ.
       *
       * Karne bugünkü kurallarla ölçüyor ama derslerin çoğu o kurallar
       * yokken üretildi. İşareti koymazsak rapor "ürün bozuk" gibi okunuyor;
       * oysa çoğu satır "bu ders eski" diyor. Kural değiştiğinde bu tarih de
       * değişmeli.
       */
      // Günün SON kural değişikliği (çizim tabanı, 35185a2). Kurallar gün
      // içinde ayrı ayrı değişti; tek bir çizgi kabadır ama "bu ders o
      // kuralları hiç görmedi" demeye yeter. Kural değişince güncelle.
      const KURAL_TARIHI = "2026-09-11T15:02:00Z";
      const eski = (lesson.created_at ?? "") < KURAL_TARIHI;
      const etiket = `${eski ? "eski" : "YENİ"} · ${prep.title?.slice(0, 20)} · ${lesson.title?.slice(0, 30)}`;
      if (eski) toplam.eskiDers += 1;

      const ped = std.validateLessonPedagogy(v, { minSections: 2 });
      if (ped.length) {
        toplam.pedagoji += 1;
        bulgular.push(`  [pedagoji] ${etiket}: ${ped.slice(0, 2).join(" / ")}`);
      }

      const sablon = v.sections.filter((s) => std.isScaffoldHeading(s.heading));
      if (sablon.length) {
        toplam.sablonBaslik += 1;
        bulgular.push(`  [şablon başlık] ${etiket}: ${sablon.map((s) => s.heading).join(", ")}`);
      }

      // Kaynağın kendi alt başlıkları ve formülleri.
      const meta = v.__meta ?? null; // ders kaydında yok; sayfalar konudan çözülüyor
      const { data: topicRow } = await db
        .from("exam_prep_topics").select("label").eq("id", lesson.topic_id).maybeSingle();
      const konu = topicRow?.label ?? lesson.title ?? "";

      let backbone = [];
      let kaynakFormulleri = [];
      const { data: node } = await db
        .from("exam_prep_nodes").select("session_meta").eq("exam_prep_id", prep.id)
        .eq("kind", "lesson").order("sort_order").limit(50);
      const eslesen = (node ?? []).find((n) => n.session_meta?.topicTitle === konu);
      const sayfalar = eslesen?.session_meta?.sourcePages ?? [];
      if (prep.document_id && sayfalar.length) {
        const { data: pages } = await db
          .from("document_pages").select("page_number, headings, formulas")
          .eq("document_id", prep.document_id).in("page_number", sayfalar)
          .order("page_number", { ascending: true });
        backbone = title.sectionHeadings((pages ?? []).map((p) => ({ headings: p.headings ?? [] })));
        kaynakFormulleri = (pages ?? []).flatMap((p) => (p.formulas ?? []).slice(0, 8));
      }

      if (backbone.length >= 2) {
        const eksik = title.unrepresentedHeadings(backbone, v.sections.map((s) => s.heading));
        if (eksik.length) {
          toplam.bolumAtlama += 1;
          bulgular.push(`  [bölüm atlandı] ${etiket}: ${eksik.slice(0, 3).join(", ")}`);
        }
      }

      if (kaynakFormulleri.length) {
        const uydurma = formula.formulaFidelityIssues(
          [v.overview, ...v.sections.map((s) => s.body), v.example?.solution].filter(Boolean),
          kaynakFormulleri,
        );
        if (uydurma.length) {
          toplam.formulUydurma += 1;
          bulgular.push(`  [formül kaynakla tutmuyor] ${etiket}: ${uydurma[0]}`);
        }
      }

      if (diag.needsDiagram(konu, ...backbone)) {
        const cizimler = v.sections.map((s) => s.diagram).filter(Boolean);
        if (!cizimler.length) {
          toplam.cizimEksik += 1;
          bulgular.push(`  [çizim yok] ${etiket} — şekille anlaşılan konu`);
        } else {
          const zayif = cizimler.flatMap((c) => diag.diagramIssues(c));
          if (zayif.length) {
            toplam.cizimZayif += 1;
            bulgular.push(`  [çizim zayıf] ${etiket}: ${zayif[0]}`);
          }
        }
      }
    }
  }

  console.log(
    `Ölçülen ders: ${toplam.ders} — ${toplam.eskiDers} tanesi bugünkü kurallardan ÖNCE üretildi.\n` +
      "Eski dersler yeni kurallarla ölçülüyor; \"eski\" satırları ürünün bugünkü\n" +
      "davranışı değil, geçmişin kaydıdır.\n",
  );
  const satir = (ad, n) =>
    console.log(`  ${ad.padEnd(26)} ${String(n).padStart(3)}${n ? "" : "  ✓"}`);
  satir("pedagoji doğrulaması düştü", toplam.pedagoji);
  satir("şablon başlık kaldı", toplam.sablonBaslik);
  satir("kaynak bölümü atlandı", toplam.bolumAtlama);
  satir("formül kaynakla tutmuyor", toplam.formulUydurma);
  satir("çizim gerekiyordu, yok", toplam.cizimEksik);
  satir("çizim var ama zayıf", toplam.cizimZayif);

  if (bulgular.length) {
    console.log(`\nAyrıntı (${bulgular.length}):`);
    for (const b of bulgular.slice(0, 40)) console.log(b);
    if (bulgular.length > 40) console.log(`  … ${bulgular.length - 40} satır daha`);
  }
} finally {
  await server.close();
}
