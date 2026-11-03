import { stripOptionLetters } from "@/lib/learning/option-text";
import { z } from "zod";
import type { LessonBody } from "@/lib/content-pool/schema";

/**
 * Sınav pedagojik iskeleti (2 Kasım 2026, ürün sahibinin kararı): sınav türüne göre her kazanım bölümünde zorunlu bloklar.
 * Model yalnız alanları doldurur; ekran blokları (diagram_card, table, note, exam_trap_card, comparison_carousel, check)
 * mevcut ders çizicisiyle kurulur. Uyum sıfır maliyetli kod kapısında denetlenir (model çağrısı yok).
 *  - klinik (TUS/DUS): patofizyoloji akışı (diagram_card), ayırıcı tanı tablosu, "en sık / altın standart / ilk seçenek"
 *    kutusu, ilaç/tedavi/komplikasyon tuzağı (exam_trap_card), 5 seçenekli klinik vaka sorusu.
 *  - kpss: kronolojik/karşılaştırma tablosu, kritik sayılar/tarihler kutusu, ÖSYM çeldirici kutusu (uydurma yüzde yok),
 *    öncüllü (I, II, III) soru.
 *  - akil (ALES/DGS): kural özeti, uzun yol ↔ 30 saniyelik kısa yol, tablo kurma adımları (diagram_card), süreli soru.
 *  - yds: sinyal kelimeler/eşdizimler, şık eleme tekniği, akademik eş anlamlılar tablosu, her şıkkı Türkçe açıklanan soru.
 */
export const BLUEPRINT_VERSION = 2; // 2: iskelet soruları denetçiyle çözülür, tek doğru şık şartı (2 Kasım 2026)
/** "sinav": iskeleti olmayan merkezi sınav programları (YKS, LGS, okul) için; yalnız kazanım dersinde kullanılır (Paket 3b). */
export type BlueprintKind = "klinik" | "kpss" | "akil" | "yds" | "sinav";

export function blueprintKind(programKind: string): BlueprintKind | null {
  if (programKind === "tus" || programKind === "dus") return "klinik";
  if (programKind === "kpss") return "kpss";
  if (programKind === "ales" || programKind === "dgs") return "akil";
  if (programKind === "yds") return "yds";
  return null;
}

/** Üst sınır aşılırsa reddetmek yerine kırpılır (sözcük sınırında); alt sınır kesin. Bir hücrenin uzunluğu iskeleti çöpe atmamalı. */
const s = (min: number, max: number) =>
  z.string().trim().min(min).transform((v) => {
    if (v.length <= max) return v;
    let cut = v.slice(0, max - 1).replace(/\s+\S*$/, "");
    // Kırpma açık parantez bırakmasın (kırık cümle sayılır): kapanmamış son "(" ve sonrası atılır.
    const open = cut.lastIndexOf("(");
    if (open > cut.lastIndexOf(")")) cut = cut.slice(0, open).trimEnd();
    return `${cut}…`;
  });
/** Fazla eleman reddedilmez, ilk `max` tutulur; alt sınır kesin. */
const arr = <T extends z.ZodTypeAny>(item: T, min: number, max: number) =>
  z.preprocess((v) => (Array.isArray(v) ? v.slice(0, max) : v), z.array(item).min(min).max(max));
/** Cevap harf ("B", "B)") ya da sayı metni gelirse 0 tabanlı sayıya çevrilir. */
const answerIndex = z.preprocess((v) => {
  if (typeof v === "string") {
    const t = v.trim();
    const m = /^([A-Ea-e])(\)|\.|$)/.exec(t);
    if (m) return m[1].toUpperCase().charCodeAt(0) - 65;
    if (/^\d+$/.test(t)) return Number(t);
  }
  return v;
}, z.number().int().min(0).max(4));
const num = z.preprocess((v) => (typeof v === "string" && /^\d+/.test(v.trim()) ? parseInt(v, 10) : v), z.number().int().min(10).max(300));
/** Her blok ayrı okunur: bozuk blok yalnız kendisi "eksik" sayılır, bütün iskelet çöpe gitmez (hangi blok bozuk, raporda görünür). */
const block = <T extends z.ZodTypeAny>(schema: T) => schema.optional().catch(undefined);
export const blueprintSchema = z.object({
  diagram: block(
    z.object({
      kind: z.enum(["process_network", "timeline"]).catch("process_network"),
      title: s(2, 120),
      caption: s(1, 200).optional().catch(undefined),
      // Model adımları düz metin olarak da yazabiliyor ("1. Tabloyu kur: …"): metin → {label, detail}.
      items: arr(
        z.preprocess((v) => {
          if (typeof v !== "string") return v;
          const t = v.trim();
          const i = t.indexOf(":");
          return i > 0 && i <= 80 ? { label: t.slice(0, i).trim(), detail: t.slice(i + 1).trim() || undefined } : { label: t };
        }, z.object({ label: s(1, 80), detail: s(1, 120).optional().catch(undefined) })),
        2,
        8,
      ),
    }),
  ),
  table: block(z.object({ caption: s(2, 100), columns: arr(s(1, 40), 2, 5), rows: arr(arr(s(1, 160), 2, 5), 2, 14) })),
  spot: block(z.object({ title: s(3, 80), points: arr(s(2, 160), 2, 6) })),
  trap: block(z.object({ title: s(3, 90), wrong: s(6, 260), right: s(6, 320), tell: s(4, 220).optional().catch(undefined) })),
  contrast: block(z.object({ long: s(4, 420), fast: s(4, 420) })),
  technique: block(z.object({ title: s(3, 80), body: s(10, 400) })),
  check: block(
    z.preprocess(
      // Soru istemindeki adlarla (choices, correct) gelebiliyor; aynı anlamdaki alanlar eşlenir.
      (v) => {
        if (!v || typeof v !== "object" || Array.isArray(v)) return v;
        const o = v as Record<string, unknown>;
        const join = (x: unknown) => (Array.isArray(x) ? x.filter((e) => typeof e === "string").join("\n") : x);
        // Öncüllü soruda model gövdeyi satır dizisi, öncülleri ayrı alan, seçenekleri {A: …} nesnesi yazabiliyor.
        let stem = join(o.stem ?? o.question ?? o.soru);
        const prem = o.premises ?? o.statements ?? o.oncul ?? o.onculler;
        if (typeof stem === "string" && Array.isArray(prem)) {
          const lines = prem.filter((e) => typeof e === "string").map((e, i) => (/^\s*I{1,3}V?\./.test(e) ? e : `${["I", "II", "III", "IV", "V"][i] ?? i + 1}. ${e}`));
          stem = `${stem}\n${lines.join("\n")}`;
        }
        let options = o.options ?? o.choices;
        if (options && typeof options === "object" && !Array.isArray(options)) options = Object.values(options as Record<string, unknown>);
        if (Array.isArray(options)) options = options.map((e) => (e && typeof e === "object" ? ((e as Record<string, unknown>).text ?? (e as Record<string, unknown>).label) : e));
        let answer = o.answer ?? o.correct ?? o.answer_index ?? o.answerIndex;
        if (typeof answer === "string" && Array.isArray(options)) {
          const a = answer.trim();
          const i = (options as unknown[]).findIndex((e) => typeof e === "string" && e.trim() === a);
          if (i >= 0) answer = i;
        }
        // Harf imleri ("A) …") cevap eşlemesinden SONRA atılır; ekran harfi kendisi basar.
        if (Array.isArray(options) && options.every((e) => typeof e === "string")) options = stripOptionLetters(options as string[]);
        return { ...o, stem, options, answer, explanation: join(o.explanation ?? o.aciklama) };
      },
      z.object({
      stem: s(8, 400),
      options: arr(s(1, 200), 2, 5),
      answer: answerIndex,
      explanation: s(8, 600),
      seconds: num.optional().catch(undefined),
      }),
    ),
  ),
});
export type Blueprint = z.infer<typeof blueprintSchema>;

const PROMPTS: Record<BlueprintKind, string> = {
  klinik:
    'Her bölümde "blueprint" nesnesi zorunlu (tıp/diş hekimliği uzmanlık sınavı düzeyi): explanation ve key_points sırasıyla ' +
    "patofizyoloji/mekanizma, en sık neden, altın standart tanı, ilk seçenek tedavi ve ayırıcı tanıyı açıkça yazar. " +
    'blueprint.diagram: {"kind":"process_network","title","items":[{"label","detail"}] 3-7 adım} — patofizyoloji ya da tanı-tedavi akışı. ' +
    'blueprint.table: {"caption":"Ayırıcı tanı","columns":["Durum","Ayırt ettiren bulgu","Tanı/test"],"rows": 3-6 satır}. ' +
    'blueprint.spot: {"title":"En sık / Altın standart / İlk seçenek","points": 3-5 madde, her biri "En sık neden: …", "Altın standart: …", "İlk seçenek: …" biçiminde}. ' +
    'blueprint.trap: {"title","wrong","right","tell"} — ilaç, tedavi ya da komplikasyon karışıklığı (wrong bilerek yanlış ifade). ' +
    'blueprint.check: {"stem": yaş/cinsiyet/şikâyet/bulgu içeren kısa klinik vaka (≤400 karakter), "options": tam 5 seçenek, "answer": 0 tabanlı, "explanation": ≤600 karakter}. ' +
    "Kesin olmayan bilgiyi kesin gibi yazma; tartışmalı ise \"genellikle\" de.",
  kpss:
    'Her bölümde "blueprint" nesnesi zorunlu (KPSS düzeyi). blueprint.table: {"caption","columns","rows"} — kronolojik ya da karşılaştırmalı tablo (2-5 sütun, 3-10 satır). ' +
    'blueprint.spot: {"title":"Kritik sayılar ve tarihler","points": 3-6 madde} — yalnız doğrulanabilir tarih, sayı, ilk/en; konu sayısal değilse kritik tanım ve ölçütler. ' +
    'blueprint.trap: {"title":"ÖSYM çeldiricisi","wrong","right","tell"} — sık karıştırılan iki bilginin karışması; yüzde, istatistik ya da "her yıl çıkar" gibi uydurma oran yazma. ' +
    'blueprint.check: {"stem": "I.", "II.", "III." öncüllerini ayrı satırlarda içeren öncüllü soru (≤400 karakter), "options": tam 5 seçenek (ör. "Yalnız I", "I ve II"), "answer", "explanation" ≤600}.',
  akil:
    'Her bölümde "blueprint" nesnesi zorunlu (ALES/DGS düzeyi). blueprint.spot: {"title":"Kural özeti","points": 2-5 kural/formül}. ' +
    'blueprint.contrast: {"long": uzun yol çözüm (adımlarıyla), "fast": 30 saniyelik kısa yol}. ' +
    'blueprint.diagram: {"kind":"process_network","title":"Tablo kurma adımları","items": 3-6 adım} — sözel mantıkta tablo/şema kurma, sayısalda çözüm akışı. ' +
    'blueprint.check: {"stem" ≤400, "options": tam 5 seçenek, "answer", "explanation" ≤600 (kısa yolu da gösterir), "seconds": hedef süre (30-120)}.',
  sinav:
    'Her bölümde "blueprint" nesnesi zorunlu (merkezi sınav düzeyi: YKS/LGS yeni nesil soru biçimi; okul ders kitabı anlatımı değil). ' +
    'blueprint.table: {"caption","columns","rows"} — kural, karşılaştırma ya da örnek-sonuç tablosu (2-5 sütun, 3-8 satır). ' +
    'blueprint.spot: {"title":"Sınavda sorulan noktalar","points": 3-5 madde} — kazanımın sınavda nasıl ölçüldüğü; uydurma oran/istatistik yazma. ' +
    'blueprint.trap: {"title":"Sık düşülen tuzak","wrong","right","tell"} — çeldiricinin dayandığı yanılgı (wrong bilerek yanlış ifade). ' +
    'blueprint.check: {"stem": bağlam, tablo ya da veri içeren yeni nesil soru kökü (≤400 karakter), "options": programın şık sayısı kadar seçenek, "answer": 0 tabanlı, "explanation" ≤600}.',
  yds:
    'Her bölümde "blueprint" nesnesi zorunlu (YDS düzeyi; örnek cümleler İngilizce, açıklamalar Türkçe). ' +
    'blueprint.spot: {"title":"Sinyal kelimeler ve eşdizimler","points": 3-6 madde, İngilizce ifade + Türkçe işlevi}. ' +
    'blueprint.technique: {"title":"Şık eleme tekniği","body": adım adım eleme yolu, Türkçe}. ' +
    'blueprint.table: {"caption":"Akademik eş anlamlılar","columns":["Kelime","Eş anlamlı","Türkçe"],"rows": 4-8 satır}. ' +
    'blueprint.check: {"stem": YDS biçiminde İngilizce boşluklu cümle/soru (≤400), "options": tam 5 İngilizce seçenek, "answer", ' +
    '"explanation": her şık için Türkçe kısa açıklama, "A) … B) … C) … D) … E) …" biçiminde (≤600 karakter)}.',
};

export function blueprintPrompt(kind: BlueprintKind | null): string {
  return kind ? `\n\n${PROMPTS[kind]}` : "";
}

const REQUIRED: Record<BlueprintKind, (keyof Blueprint)[]> = {
  klinik: ["diagram", "table", "spot", "trap", "check"],
  kpss: ["table", "spot", "trap", "check"],
  akil: ["spot", "contrast", "diagram", "check"],
  yds: ["spot", "technique", "table", "check"],
  sinav: ["table", "spot", "trap", "check"],
};

type SectionWithBlueprint = LessonBody["sections"][number] & { blueprint?: unknown };

/** Sıfır maliyetli iskelet kapısı: eksik/bozuk zorunlu blok, seçenek sayısı ve sınav biçimi. */
export function blueprintIssues(lesson: LessonBody, kind: BlueprintKind | null, choices = 5): string[] {
  if (!kind) return [];
  const issues: string[] = [];
  for (const raw of lesson.sections as SectionWithBlueprint[]) {
    const code = raw.outcome_code.trim();
    if (raw.blueprint == null) {
      issues.push(`${code}: iskelet yok`);
      continue;
    }
    const parsed = blueprintSchema.safeParse(raw.blueprint ?? null);
    if (!parsed.success) {
      issues.push(`${code}: iskelet okunamadı (${typeof raw.blueprint === "object" ? (Array.isArray(raw.blueprint) ? "dizi" : "nesne") : typeof raw.blueprint})`);
      continue;
    }
    const bp = parsed.data;
    for (const key of REQUIRED[kind]) {
      if (bp[key]) continue;
      // Tanı için: model bloğu yazdıysa hangi alanlarla yazdığı (içerik değil, yalnız alan adları ve türü).
      const given = (raw.blueprint as Record<string, unknown>)[key];
      const shape = given == null ? "yok" : typeof given === "object" && !Array.isArray(given) ? Object.keys(given).slice(0, 8).join(",") : Array.isArray(given) ? "dizi" : typeof given;
      issues.push(`${code}: iskelet bloğu eksik (${key}; ${shape})`);
    }
    const c = bp.check;
    if (c) {
      if (c.options.length !== choices) issues.push(`${code}: iskelet sorusu ${c.options.length} seçenek (beklenen ${choices})`);
      if (c.answer >= c.options.length) issues.push(`${code}: iskelet sorusu cevabı seçeneklerin dışında`);
      if (new Set(c.options.map((o) => o.normalize("NFKC").replace(/\s+/g, " ").trim())).size !== c.options.length)
        issues.push(`${code}: iskelet sorusunda aynı seçenek iki kez`);
      if (kind === "kpss" && !/(^|\s)I\.[\s\S]*(^|\s)II\.[\s\S]*(^|\s)III\./m.test(c.stem)) issues.push(`${code}: öncüllü (I, II, III) soru değil`);
      if (kind === "akil" && !c.seconds) issues.push(`${code}: süreli soru hedef süresi yok`);
      if (kind === "yds" && !/A\)[\s\S]*B\)[\s\S]*C\)[\s\S]*D\)[\s\S]*E\)/.test(c.explanation)) issues.push(`${code}: her şıkkın Türkçe açıklaması yok`);
    }
    if (kind === "klinik" && bp.spot && !/en sık/i.test(bp.spot.points.join(" ")) ) issues.push(`${code}: "en sık" maddesi yok`);
    if (kind === "kpss" && bp.trap && /%\s?\d|\d+\s?%|yüzde\s?\d/i.test(`${bp.trap.wrong} ${bp.trap.right} ${bp.trap.tell ?? ""}`))
      issues.push(`${code}: çeldirici kutusunda oran/yüzde var (uydurma veri yasak)`);
  }
  return issues;
}

/** İskelet → ders ekranı blokları (mevcut çizici türleri). Sıra: akış, tablo, kutu, kısa yol, tuzak, soru. */
export function blueprintBlocks(raw: unknown, kind: BlueprintKind | null): Record<string, unknown>[] {
  const parsed = blueprintSchema.safeParse(raw ?? null);
  if (!parsed.success) return [];
  const bp = parsed.data;
  const out: Record<string, unknown>[] = [];
  if (bp.diagram)
    out.push({
      type: "diagram_card",
      diagramKind: bp.diagram.kind,
      title: bp.diagram.title,
      ...(bp.diagram.caption ? { caption: bp.diagram.caption } : {}),
      items: bp.diagram.items.map((i) => ({ label: i.label, ...(i.detail ? { detail: i.detail } : {}) })),
    });
  if (bp.table) {
    const width = bp.table.columns.length;
    out.push({
      type: "table",
      table: { caption: bp.table.caption, columns: bp.table.columns, rows: bp.table.rows.map((r) => [...r, ...Array(Math.max(0, width - r.length)).fill("—")].slice(0, width)) },
    });
  }
  if (bp.spot) out.push({ type: "note", note: { title: bp.spot.title, body: bp.spot.points.map((p) => `• ${p}`).join("\n").slice(0, 400), tone: kind === "klinik" ? "exam" : "remember" } });
  if (bp.technique) out.push({ type: "note", note: { title: bp.technique.title, body: bp.technique.body, tone: "exam" } });
  if (bp.contrast)
    out.push({
      type: "comparison_carousel",
      carousel: { title: "Uzun yol ↔ 30 saniyelik kısa yol", mode: "compare", slides: [{ title: "Uzun yol", body: bp.contrast.long }, { title: "Kısa yol (30 sn)", body: bp.contrast.fast }] },
    });
  if (bp.trap) out.push({ type: "exam_trap_card", trap: bp.trap });
  if (bp.check) {
    const prompt = bp.check.seconds ? `⏱ Hedef süre: ${bp.check.seconds} sn\n${bp.check.stem}` : bp.check.stem;
    out.push({
      type: "check",
      check: {
        type: "mcq",
        prompt: prompt.slice(0, 400),
        options: stripOptionLetters(bp.check.options).map((o) => o.slice(0, 200)),
        answerIndex: bp.check.answer,
        explanation: bp.check.explanation,
      },
    });
  }
  return out;
}

/**
 * Bölüm iskelet sorularını (blueprint.check) doğrulama adayı olarak çıkarır. 2 Kasım 2026'ya kadar bu sorular
 * modelle hiç çözülmüyordu; canlı ALES sözel dersinde iki şıkkı da kuralları sağlayan eşleştirme sorusu çıktı.
 */
export function blueprintChecks(lesson: LessonBody): { outcome_code: string; stem: string; choices: string[]; answer: number; explanation: string }[] {
  const out: { outcome_code: string; stem: string; choices: string[]; answer: number; explanation: string }[] = [];
  for (const s of lesson.sections ?? []) {
    const parsed = blueprintSchema.safeParse((s as { blueprint?: unknown }).blueprint ?? null);
    const c = parsed.success ? parsed.data.check : undefined;
    if (!c || c.answer >= c.options.length) continue;
    out.push({ outcome_code: s.outcome_code.trim(), stem: c.stem, choices: c.options, answer: c.answer, explanation: c.explanation });
  }
  return out;
}
