/**
 * Görsel şölen motoru istemleri ve düz metin görünümü (19 Kasım 2026, Faz 1-B).
 *
 * Model yalnız YAPI verisi yazar (etiket, rol, yön, büyüklük, kesir…); koordinat yazmaz — yerleşimi kod yapar,
 * böylece taşma ve çakışma olmaz. Her arketipin JSON iskeleti burada; ders tamamlaması ve 1 dk çizimli video
 * aynı iskeleti kullanır. İskeletlerdeki "…" yer tutucudur; örnek konu, formül ya da sayı yoktur (motor evrensel).
 */
import { ARCHETYPE_LABEL, ACADEMIC_DOMAINS, CONCEPT_STRUCTURE_LABEL, DOMAIN_LABEL, VISUAL_ARCHETYPES, type AcademicDomain, type VisualArchetype } from "./archetype";
import { PATHWAY_ROLE_LABEL, lawTreeNodes, lawTreeOf, type LawTreeNode, type ReelVisual, type VisualScene } from "./schema";

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
    when: "Mimarlık, iç mimarlık, inşaat, sanat tarihi: plan, kesit, cephe, yapı elemanı, katman, üslup.",
    draws:
      "Çizim verinden kurulur: elements[] her öğesi kind (column, beam, slab, wall, opening, arch, dome, vault, roof, " +
      "foundation, stair, facade), count (kolon = aks sayısı, döşeme = kat sayısı, açıklık = kat başına pencere) ve variant " +
      "(çatıda gable|flat|shed, açıklıkta window|door, kemerde round|pointed) taşır. viewType: section (kesilen eleman " +
      "taranır), elevation (dış görünüş), plan (aks ızgarası), schematic (layers varsa katman detayı, yoksa statik şema). " +
      "layers: duvar/döşeme/çatı katmanları dıştan içe sırayla (name, material, thickness yalnız kaynakta yazıyorsa). " +
      "calloutPins: n numaralı pin target'taki öğenin (element id ya da layer name) üstüne oturur; target yoksa x, y (0-1). " +
      "Pin yazılmazsa her eleman kendi pinini alır. Ölçü oku (dimension) ve ışık/yük akışı (flow: light | load | both).",
    json:
      '{"archetype":"ARCHITECTURE_SPATIAL_BLUEPRINT","title":"…","viewType":"section|elevation|plan|schematic","theme":"night|paper","elements":[{"id":"e1","label":"…","role":"…","kind":"column","count":3,"variant":"gable"}],"layers":[{"name":"…","material":"…","thickness":"…","order":1}],"calloutPins":[{"n":1,"target":"e1","note":"…"}],"dimension":{"label":"…"},"flow":"light|load|both"}',
  },
  LAW_SOCIAL_FLOWCHART: {
    when: "Hukuk, KPSS, anayasa, idare, sosyal bilimler: koşul, karar, yetki, usul.",
    draws:
      "Çok kademeli karar ağacı (nodes, derinlik en çok 3): ilk düğüm kök; yes/no başka bir düğümün id'si ya da doğrudan " +
      "sonuç metni; ikiden çok dal için branches [{label, to}]. Çoğunluk barometresi (majority: eşik fraction \"a/b\", " +
      "count eşiğin sayısı, total toplam, actual gerçekleşen — yalnız kaynakta geçen sayılar; actual eşiği geçerse yeşil). " +
      "Zaman çizgisi (timeline 0-5 durak). ruleVsException İSTEĞE BAĞLI: kaynak istisna söylemiyorsa alanı yazma, istisna uydurma.",
    json:
      '{"archetype":"LAW_SOCIAL_FLOWCHART","title":"…","nodes":[{"id":"q1","text":"…?","yes":"q2","no":"…"},{"id":"q2","text":"…?","yes":"…","no":"…"}],"majority":[{"label":"…","fraction":"a/b","count":0,"total":0,"actual":0}],"timeline":[{"date":"…","label":"…"}],"ruleVsException":{"rule":["…"],"exception":["…"]}}',
  },
  MATH_ALGORITHMIC_GRAPH: {
    when: "Matematik, geometri, algoritma, istatistik: fonksiyon, eğri, integral, şekil, adım adım dönüşüm.",
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
  CONCEPT_STRUCTURE_VISUALIZER: {
    when: "İktisat, tarih, psikoloji, coğrafya, edebiyat, felsefe, yabancı dil ve genel dersler: süreç, karşılaştırma, katman, kronoloji, neden-sonuç, arz-talep.",
    draws:
      "structure konunun yapısına göre: process (sıralı adımlar, items), matrix (karşılaştırma: columns + comparisonRows " +
      "[{label, values[], highlight}]), pyramid (items tepeden tabana), timeline (items + date), cause_effect (items + links " +
      "[{from, to, effect: increase | decrease}], from/to item id'si), supply_demand (market: eğri adları, equilibrium, shift " +
      "{curve: supply | demand, direction: right | left, label}). Eğim, denge ve kayma kodda hesaplanır. takeaway: sınavda " +
      "sorulan tek cümle.",
    json:
      '{"archetype":"CONCEPT_STRUCTURE_VISUALIZER","title":"…","structure":"process|matrix|pyramid|timeline|cause_effect|supply_demand","items":[{"id":"a","label":"…","detail":"…","date":"…"}],"links":[{"from":"a","to":"b","effect":"increase"}],"columns":["…"],"comparisonRows":[{"label":"…","values":["…"],"highlight":0}],"market":{"priceLabel":"…","quantityLabel":"…","supplyLabel":"…","demandLabel":"…","equilibrium":"…","shift":{"curve":"demand","direction":"right","label":"…"}},"takeaway":"…"}',
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
  "tutmuyorsa ya da ilişkiden emin değilsen o ilişkiyi çizme. " +
  "SEVİYE: sahneye pedagogicalLevel yaz (SEVİYE KALİBRASYONU bloğundaki seviye: 1 Ortaokul/LGS, 2 Lise/YKS, 3 Üniversite, " +
  "4 Uzmanlık; blok yoksa yazma). Seviye 1'de en çok 5 kısa etiket ve az öğe; 3-4'te teknik ayrıntı (katman, birim, ölçü, " +
  "eşik, istisna). Yoğunluk kaynak ve doğruluk kurallarını değiştirmez.";

/** Disiplin listesi (istemde seçim için). */
export function domainChoices(): string {
  return ACADEMIC_DOMAINS.map((domain) => `${domain} (${DOMAIN_LABEL[domain]})`).join(", ");
}

/** İstemde arketip bölümü: güven yüksekse yalnız seçilen arketip; düşükse altısı ve seçim hakkı. */
/** Karar ağacının düz metni (soru → evet: … ; hayır: …), alt kademeler parantezle. */
function lawTreeText(node: LawTreeNode): string {
  if (!node.children.length) return node.text;
  return `${node.text} ${node.children
    .map((child) => `${child.label.toLocaleLowerCase("tr")} → ${child.node.children.length ? `(${lawTreeText(child.node)})` : child.node.text}`)
    .join("; ")}`;
}

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
        labels: [...scene.elements.map((element) => element.label), ...scene.layers.map((layer) => layer.name), ...scene.calloutPins.flatMap((pin) => (pin.label ? [pin.label] : []))],
        prose: [
          scene.title,
          ...scene.elements.map((element) => element.role),
          ...scene.layers.flatMap((layer) => [layer.material, layer.thickness].filter((part): part is string => Boolean(part))),
          ...scene.calloutPins.flatMap((pin) => (pin.note ? [pin.note] : [])),
          ...(scene.dimension ? [scene.dimension.label] : []),
        ],
        symbols: [],
      };
    case "LAW_SOCIAL_FLOWCHART": {
      const nodes = lawTreeNodes(lawTreeOf(scene));
      return {
        labels: [...nodes.filter((node) => node.children.length).map((node) => node.text), ...scene.timeline.map((stop) => stop.label), ...scene.majority.map((row) => row.label)],
        prose: [
          scene.title,
          ...nodes.filter((node) => !node.children.length).map((node) => node.text),
          ...nodes.flatMap((node) => node.children.map((child) => child.label)),
          ...scene.majority.map((row) => [row.fraction, row.count, row.total, row.actual].filter((part) => part != null).join(" ")),
          ...scene.timeline.map((stop) => stop.date),
          ...(scene.ruleVsException?.rule ?? []),
          ...(scene.ruleVsException?.exception ?? []),
        ],
        symbols: [],
      };
    }
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
    case "CONCEPT_STRUCTURE_VISUALIZER": {
      const market = scene.market;
      return {
        labels: [...scene.items.map((item) => item.label), ...scene.columns, ...scene.comparisonRows.map((row) => row.label)],
        prose: [
          scene.title,
          ...scene.items.flatMap((item) => [item.detail, item.date].filter((part): part is string => Boolean(part))),
          ...scene.links.flatMap((link) => (link.label ? [link.label] : [])),
          ...scene.comparisonRows.flatMap((row) => row.values),
          ...(market
            ? [market.priceLabel, market.quantityLabel, market.supplyLabel, market.demandLabel, market.equilibrium, market.shift?.label].filter((part): part is string => Boolean(part))
            : []),
          ...(scene.takeaway ? [scene.takeaway] : []),
        ],
        symbols: [],
      };
    }
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
      return [
        `${scene.title}: ${scene.elements.map((element, index) => `${index + 1}) ${element.label}: ${element.role}`).join("; ")}`,
        scene.layers.length ? `Katmanlar: ${scene.layers.map((layer) => [layer.name, layer.material, layer.thickness].filter(Boolean).join(" ")).join(" / ")}.` : "",
      ]
        .filter(Boolean)
        .join(" ");
    case "LAW_SOCIAL_FLOWCHART": {
      const root = lawTreeOf(scene);
      return [
        `${scene.title}: ${root ? lawTreeText(root) : ""}.`,
        scene.majority.length
          ? `Çoğunluk: ${scene.majority
              .map((row) => `${row.label} ${row.fraction}${row.count ? ` = ${row.count}` : ""}${row.total ? ` (toplam ${row.total})` : ""}${row.actual != null ? `, gerçekleşen ${row.actual}` : ""}`)
              .join(", ")}.`
          : "",
        scene.timeline.length ? `Zaman çizgisi: ${scene.timeline.map((stop) => `${stop.date} ${stop.label}`).join(" → ")}.` : "",
        scene.ruleVsException
          ? `Genel kural: ${scene.ruleVsException.rule.join("; ")}.${scene.ruleVsException.exception.length ? ` İstisna: ${scene.ruleVsException.exception.join("; ")}.` : ""}`
          : "",
      ]
        .filter(Boolean)
        .join(" ");
    }
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
    case "CONCEPT_STRUCTURE_VISUALIZER": {
      const head = `${scene.title} (${CONCEPT_STRUCTURE_LABEL[scene.structure]})`;
      const items = scene.items.map((item) => [item.date, item.label, item.detail ? `(${item.detail})` : ""].filter(Boolean).join(" "));
      const market = scene.market;
      const body =
        scene.structure === "matrix"
          ? scene.comparisonRows
              .map((row) => `${row.label}: ${row.values.map((value, index) => (scene.columns[index] ? `${scene.columns[index]} ${value}` : value)).join(", ")}`)
              .join("; ")
          : scene.structure === "supply_demand"
            ? [
                `arz: ${market?.supplyLabel ?? "arz"}, talep: ${market?.demandLabel ?? "talep"}`,
                market?.equilibrium ? `denge: ${market.equilibrium}` : "",
                market?.shift
                  ? `${market.shift.curve === "supply" ? "arz" : "talep"} ${market.shift.direction === "right" ? "sağa" : "sola"} kayar${market.shift.label ? ` (${market.shift.label})` : ""}`
                  : "",
              ]
                .filter(Boolean)
                .join("; ")
            : items.join(scene.structure === "pyramid" ? " / " : " → ");
      return [`${head}: ${body}.`, scene.takeaway ?? ""].filter(Boolean).join(" ");
    }
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
