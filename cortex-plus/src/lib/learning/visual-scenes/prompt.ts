/**
 * Görsel şölen motoru istemleri ve düz metin görünümü (19 Kasım 2026, Faz 1-B).
 *
 * Model yalnız YAPI verisi yazar (etiket, rol, yön, büyüklük, kesir…); koordinat yazmaz — yerleşimi kod yapar,
 * böylece taşma ve çakışma olmaz. Her arketipin JSON iskeleti burada; ders tamamlaması ve 1 dk çizimli video
 * aynı iskeleti kullanır. İskeletlerdeki "…" yer tutucudur; örnek konu, formül ya da sayı yoktur (motor evrensel).
 */
import { ARCHETYPE_LABEL, ACADEMIC_DOMAINS, DOMAIN_LABEL, VISUAL_ARCHETYPES, type AcademicDomain, type VisualArchetype } from "./archetype";
import { PATHWAY_ROLE_LABEL, type ReelVisual, type VisualScene } from "./schema";

/** Arketip başına: ne zaman, ne çizer, JSON iskeleti. */
export const ARCHETYPE_SPEC: Record<VisualArchetype, { when: string; draws: string; json: string }> = {
  MEDICAL_BIOLOGY_PATHWAY: {
    when: "Tıp, diş, eczacılık, biyoloji: mekanizma, yolak, fizyopatoloji, ilaç etkisi.",
    draws:
      "Hücre/doku/organ zemininde renk kodlu zincir: Tetikleyici → Reseptör → İkincil Haberci → Enzim/Hedef → Klinik Bulgu. " +
      "Bir adıma gelen ok aktivasyonsa effect \"activate\" (yeşil), inhibisyon/blokajsa \"inhibit\" (kırmızı [X]). " +
      "spotlight: sınavda en çok sorulan klinik nokta (TUS / Klinik Spotu rozeti).",
    json:
      '{"archetype":"MEDICAL_BIOLOGY_PATHWAY","title":"…","layer":"cell|tissue|organ","steps":[{"role":"trigger|receptor|messenger|target|finding","label":"…","detail":"…","effect":"activate|inhibit"}],"spotlight":{"text":"…"}}',
  },
  ENGINEERING_PHYSICS_MECHANICS: {
    when: "Fizik, mühendislik, kimya: kuvvet, alan, akış, devre, denge; kuvvet olmayan eğilim ve değişim yönleri de (setting trend).",
    draws:
      "Serbest cisim diyagramı (free_body | fluid | circuit) ya da kuvvet olmayan içerikte eğilim/yön diyagramı (trend: ör. bir " +
      "tabloda ya da seride ilerledikçe bir niceliğin artması/azalması; kuvvet, cisim, serbest cisim dili KULLANMA). Vektör: symbol " +
      "(alt simge _ ile, ör. F_1), label, direction (up, down, left, right, up_right, up_left, down_right, down_left), magnitude 1-5 " +
      "(ok uzunluğu ve kalınlığı); trend sahnesinde trend: increase | decrease (ok yönünde ilerledikçe nicelik artar/azalır). " +
      "Okun yönü etiketteki yönle AYNI olmalı: \"soldan sağa\" → right, \"sağdan sola\" → left, \"yukarıdan aşağıya\" → down, " +
      "\"aşağıdan yukarıya\" → up; azalmayı oku ters çevirerek değil trend: decrease ile göster. " +
      "logic: Formülün (trend sahnesinde Eğilimin) Mantığı paneli; drivers = değişken artınca (ya da o yönde ilerleyince) sonuç " +
      "artar (up) ya da azalır (down); distractors = soruda verilip formülde/eğilimde OLMAYAN çeldirici değişkenler. Etiketler " +
      "kısaltılmadan tam yazılır (en çok 50 karakter).",
    json:
      '{"archetype":"ENGINEERING_PHYSICS_MECHANICS","title":"…","setting":"free_body|fluid|circuit|trend","body":{"label":"…"},"vectors":[{"symbol":"…","label":"…","direction":"right","magnitude":3,"trend":"increase|decrease"}],"logic":{"formula":"…","drivers":[{"symbol":"…","label":"…","effect":"up|down"}],"distractors":[{"symbol":"…","label":"…"}]}}',
  },
  ARCHITECTURE_SPATIAL_BLUEPRINT: {
    when: "Mimarlık, iç mimarlık, inşaat, sanat tarihi: plan, kesit, cephe, yapı elemanı, üslup.",
    draws:
      "Gece mavisi teknik pafta üstünde kesit ya da cephe; 2-4 numaralı callout pini (sırasıyla taşıyıcı aks, cephe " +
      "katmanı, açıklık, döşeme/kesit konumuna oturur); ölçü oku ve ışık/yük akış okları (flow: light | load | both).",
    json:
      '{"archetype":"ARCHITECTURE_SPATIAL_BLUEPRINT","title":"…","view":"section|elevation","theme":"night|paper","elements":[{"label":"…","role":"…"}],"dimension":{"label":"…"},"flow":"light|load|both"}',
  },
  LAW_SOCIAL_FLOWCHART: {
    when: "Hukuk, KPSS, anayasa, tarih, felsefe, sosyal bilimler, edebiyat: süreç, koşul, karar, kronoloji.",
    draws:
      "Evet/Hayır karar dalları (decision), nitelikli çoğunluk barometresi (majority: fraction \"a/b\", varsa count ve " +
      "total — yalnız kaynakta geçen sayılar), zaman çizgisi (timeline 0-5 durak) ve Genel Kural ↔ İstisna karşılaştırması.",
    json:
      '{"archetype":"LAW_SOCIAL_FLOWCHART","title":"…","decision":{"question":"…","yes":"…","no":"…"},"majority":[{"label":"…","fraction":"a/b","count":0,"total":0}],"timeline":[{"date":"…","label":"…"}],"ruleVsException":{"rule":["…"],"exception":["…"]}}',
  },
  MATH_ALGORITHMIC_GRAPH: {
    when: "Matematik, geometri, algoritma, istatistik, iktisat: fonksiyon, eğri, integral, şekil, adım adım dönüşüm.",
    draws:
      "mode function: koordinat ekseninde eğri (family: linear, quadratic, cubic, exponential, logarithmic, sine, absolute; " +
      "flipped = ters yönlü) ve kritik noktalar (root, vertex, y_intercept, max, min, inflection). mode integral: taranmış " +
      "alan (from, to, label). mode geometry: şekil (triangle, right_triangle, rectangle, parallelogram, circle) üstünde aynı " +
      "group numaralı açı/kenarlar aynı renkte eşleşir. steps: 0-4 adımlık dönüşüm çipleri.",
    json:
      '{"archetype":"MATH_ALGORITHMIC_GRAPH","title":"…","mode":"function|integral|geometry","curve":{"family":"…","expression":"…","flipped":false,"points":[{"kind":"root","label":"…"}]},"integral":{"from":"…","to":"…","label":"…"},"shape":{"kind":"triangle","angles":[{"label":"…","group":1}],"sides":[{"label":"…","group":1}]},"steps":["…"]}',
  },
  DOCUMENT_FIGURE_SPOTLIGHT: {
    when: "Kaynakta tablo ya da şekil var ve sınavda doğrudan o soruluyor.",
    draws:
      "Belgedeki tablonun kendisi (sütun ve satırlar KAYNAKTAKİ hücrelerle aynen), sınavda sorulacak 1-3 hücre spotlight " +
      "halkasıyla vurgulanır ve çağrı okuyla açıklanır (spots: row/col 0'dan; başlık satırı sayılmaz).",
    json:
      '{"archetype":"DOCUMENT_FIGURE_SPOTLIGHT","title":"…","page":1,"figure":{"kind":"table","caption":"…","columns":["…"],"rows":[["…"]]},"spots":[{"row":0,"col":0,"label":"…","note":"…"}]}',
  },
};

export const VISUAL_SCENE_COMMON_RULE =
  "Sahne yeni bilgi taşımaz: her etiket, sayı, tarih ve kesir yalnız DERS metninde ya da KAYNAK'ta geçenden gelir. " +
  "Koordinat, renk ya da piksel yazma; yerleşimi kod yapar. Etiketler kısa (2-5 kelime), açıklamalar tek cümle. " +
  "symbol, harf ve sınır alanları kelime değil simgedir (en çok 6 karakter: F_1, ΔT, EN gibi); formül ya da kural " +
  "cümlesi en çok 80 karakter. Kısaltmak için cümleyi yarıda kesme ve \"…\" koyma; daha kısa, tam bir ifade yaz. " +
  "Düz paragraf yazma: her alan çizimin bir parçasıdır. " +
  "BİLGİ DOĞRULUĞU: sahnenin anlattığı ilişki (doğru ya da ters orantı, artar ya da azalır, yön) yalnız DERS'in " +
  "doğrulanmış anlatımından ve yerleşik bilimden gelir; KAYNAK yalnız etiket ve sayı içindir. KAYNAK DÜZELTMESİ " +
  "verildiyse kaynağın yanlış ifadesini sahneye koyma, doğrusunu kullan. Bir denklemde aynı yanda çarpılan iki büyüklük " +
  "(öbürleri sabitken) ters orantılıdır; biri artarken öbürünü azalır göster. Kaynak, ders metni ve denklem birbirini " +
  "tutmuyorsa ya da ilişkiden emin değilsen o ilişkiyi çizme.";

/** Disiplin listesi (istemde seçim için). */
export function domainChoices(): string {
  return ACADEMIC_DOMAINS.map((domain) => `${domain} (${DOMAIN_LABEL[domain]})`).join(", ");
}

/** İstemde arketip bölümü: güven yüksekse yalnız seçilen arketip; düşükse altısı ve seçim hakkı. */
export function archetypeSpecBlock(archetype: VisualArchetype, confident: boolean): string {
  const one = (key: VisualArchetype) => {
    const spec = ARCHETYPE_SPEC[key];
    return `${key} — ${ARCHETYPE_LABEL[key]}. Ne zaman: ${spec.when} Çizim: ${spec.draws}\nJSON: ${spec.json}`;
  };
  if (confident) return `ARKETİP (kod seçti): ${one(archetype)}`;
  return (
    `ÖNERİLEN ARKETİP: ${archetype}. Konu açıkça başka bir branşa aitse aşağıdakilerden ona uyanı seç.\n` +
    VISUAL_ARCHETYPES.map(one).join("\n")
  );
}

/** Sahnenin bütün yazıları (düz metin görünümü, temellendirme, tekrar kaynağı). */
export function visualSceneStrings(scene: VisualScene): { labels: string[]; prose: string[]; symbols: string[] } {
  switch (scene.archetype) {
    case "MEDICAL_BIOLOGY_PATHWAY":
      return {
        labels: scene.steps.map((step) => step.label),
        prose: [scene.title, ...scene.steps.flatMap((step) => (step.detail ? [step.detail] : [])), scene.spotlight.text],
        symbols: [],
      };
    case "ENGINEERING_PHYSICS_MECHANICS":
      return {
        labels: [scene.body.label, ...scene.vectors.map((vector) => vector.label), ...scene.logic.drivers.map((driver) => driver.label)],
        prose: [scene.title, ...scene.logic.distractors.map((item) => item.label)],
        symbols: [scene.logic.formula, ...scene.vectors.map((vector) => vector.symbol), ...scene.logic.drivers.map((driver) => driver.symbol), ...scene.logic.distractors.map((item) => item.symbol)],
      };
    case "ARCHITECTURE_SPATIAL_BLUEPRINT":
      return {
        labels: scene.elements.map((element) => element.label),
        prose: [scene.title, ...scene.elements.map((element) => element.role), ...(scene.dimension ? [scene.dimension.label] : [])],
        symbols: [],
      };
    case "LAW_SOCIAL_FLOWCHART":
      return {
        labels: [scene.decision.question, ...scene.timeline.map((stop) => stop.label), ...scene.majority.map((row) => row.label)],
        prose: [
          scene.title,
          scene.decision.yes,
          scene.decision.no,
          ...scene.majority.map((row) => [row.fraction, row.count, row.total].filter((part) => part != null).join(" ")),
          ...scene.timeline.map((stop) => stop.date),
          ...scene.ruleVsException.rule,
          ...scene.ruleVsException.exception,
        ],
        symbols: [],
      };
    case "MATH_ALGORITHMIC_GRAPH":
      return {
        labels: [...(scene.curve?.points.map((point) => point.label) ?? []), ...(scene.integral ? [scene.integral.label] : [])],
        prose: [scene.title, ...scene.steps],
        symbols: [
          ...(scene.curve ? [scene.curve.expression] : []),
          ...(scene.integral ? [scene.integral.from, scene.integral.to] : []),
          ...(scene.shape ? [...scene.shape.angles.map((angle) => angle.label), ...scene.shape.sides.map((side) => side.label)] : []),
        ],
      };
    case "DOCUMENT_FIGURE_SPOTLIGHT":
      return {
        labels: [
          ...(scene.figure.kind === "table" ? [...scene.figure.columns, ...scene.figure.rows.flat()] : []),
          ...scene.spots.map((spot) => spot.label),
        ],
        prose: [scene.title, scene.figure.caption, ...scene.spots.map((spot) => spot.note)],
        symbols: [],
      };
  }
}

/** Düz metin: V2 görünümü, sohbet bağlamı, podcast ve kalite yargıcı sahneyi kaybetmesin. */
export function visualSceneText(scene: VisualScene): string {
  switch (scene.archetype) {
    case "MEDICAL_BIOLOGY_PATHWAY":
      return `${scene.title}: ${scene.steps
        .map((step, index) => `${index > 0 ? (step.effect === "inhibit" ? "⊣ " : "→ ") : ""}${PATHWAY_ROLE_LABEL[step.role]}: ${step.label}${step.detail ? ` (${step.detail})` : ""}`)
        .join(" ")} Klinik spot: ${scene.spotlight.text}`;
    case "ENGINEERING_PHYSICS_MECHANICS":
      return [
        `${scene.title}: ${scene.vectors.map((vector) => `${vector.symbol.replace(/_/g, "")} ${vector.label}`).join(", ")}.`,
        `Formül: ${scene.logic.formula.replace(/_/g, "")}. ${scene.logic.drivers.map((driver) => `${driver.symbol} ${driver.effect === "up" ? "artarsa sonuç artar" : "artarsa sonuç azalır"} (${driver.label})`).join("; ")}.`,
        scene.logic.distractors.length ? `Formülde olmayan: ${scene.logic.distractors.map((item) => `${item.symbol} ${item.label}`).join(", ")}.` : "",
      ]
        .filter(Boolean)
        .join(" ");
    case "ARCHITECTURE_SPATIAL_BLUEPRINT":
      return `${scene.title}: ${scene.elements.map((element, index) => `${index + 1}) ${element.label}: ${element.role}`).join("; ")}`;
    case "LAW_SOCIAL_FLOWCHART":
      return [
        `${scene.title}: ${scene.decision.question} Evet → ${scene.decision.yes}; Hayır → ${scene.decision.no}.`,
        scene.majority.length ? `Çoğunluk: ${scene.majority.map((row) => `${row.label} ${row.fraction}${row.count ? ` = ${row.count}` : ""}`).join(", ")}.` : "",
        scene.timeline.length ? `Zaman çizgisi: ${scene.timeline.map((stop) => `${stop.date} ${stop.label}`).join(" → ")}.` : "",
        `Genel kural: ${scene.ruleVsException.rule.join("; ")}. İstisna: ${scene.ruleVsException.exception.join("; ")}.`,
      ]
        .filter(Boolean)
        .join(" ");
    case "MATH_ALGORITHMIC_GRAPH":
      return [
        scene.title,
        scene.curve ? `${scene.curve.expression}${scene.curve.points.length ? ` (${scene.curve.points.map((point) => point.label).join(", ")})` : ""}` : "",
        scene.integral ? `${scene.integral.label}: ${scene.integral.from} → ${scene.integral.to}` : "",
        scene.steps.length ? `Adımlar: ${scene.steps.join(" → ")}` : "",
      ]
        .filter(Boolean)
        .join(". ");
    case "DOCUMENT_FIGURE_SPOTLIGHT":
      return `${scene.title} (${scene.figure.caption}): ${scene.spots.map((spot) => `${spot.label} — ${spot.note}`).join("; ")}`;
  }
}

export function reelVisualText(visual: ReelVisual): string {
  switch (visual.kind) {
    case "hook":
      return `${visual.visualTitle}: ${visual.question}`;
    case "archetype":
      return visualSceneText(visual.scene);
    case "comparison":
      return `${visual.title}: ${visual.left} / ${visual.right} — ${visual.rows.map((row) => `${row.label}: ${row.left} | ${row.right}`).join("; ")}`;
    case "exam_trap":
      return `Sakın buna düşme — ${visual.title}: Yanlış: ${visual.wrong} Doğrusu: ${visual.right}${visual.tell ? ` İpucu: ${visual.tell}` : ""}`;
    case "memory_nail":
      return `Hafıza çivisi ${visual.mnemonic}: ${visual.keys.map((key) => `${key.letter} = ${key.meaning}`).join(", ")}. ${visual.summary}`;
  }
}

/** Stored-scene okuyucu yardımcıları (UI rozetleri). */
export function domainLabel(domain: AcademicDomain | undefined): string | undefined {
  return domain ? DOMAIN_LABEL[domain] : undefined;
}
