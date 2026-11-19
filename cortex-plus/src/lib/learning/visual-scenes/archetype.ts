/**
 * Görsel şölen motoru (19 Kasım 2026, Faz 1-B): branş arketipleri ve disiplin sınıflandırıcısı.
 *
 * Ders (`LessonV3`) ve 1 dk çizimli video (`sketch_reel`) aynı altı arketipten birini çizer. Disiplin
 * kodla, model çağrısı olmadan sınıflandırılır (hazırlık adı + konu adı + kaynaktan kısa örnek); yazar
 * istemine "bu konunun arketipi şu" diye verilir, model o arketipin verisini yazar. Sınıflandırma ders
 * adına bağlı değildir: anahtar kelime aileleri disiplinin kendisini tarif eder.
 */

export const VISUAL_ARCHETYPES = [
  "MEDICAL_BIOLOGY_PATHWAY",
  "ENGINEERING_PHYSICS_MECHANICS",
  "ARCHITECTURE_SPATIAL_BLUEPRINT",
  "LAW_SOCIAL_FLOWCHART",
  "MATH_ALGORITHMIC_GRAPH",
  "DOCUMENT_FIGURE_SPOTLIGHT",
] as const;
export type VisualArchetype = (typeof VISUAL_ARCHETYPES)[number];

export const ACADEMIC_DOMAINS = [
  "medicine",
  "dentistry",
  "pharmacy",
  "biology",
  "physics",
  "engineering",
  "chemistry",
  "architecture",
  "interior_architecture",
  "civil_engineering",
  "art_history",
  "law",
  "kpss",
  "constitution",
  "history",
  "philosophy",
  "social_science",
  "literature",
  "mathematics",
  "geometry",
  "algorithm",
  "statistics",
  "economics",
  "document_figure",
  "general",
] as const;
export type AcademicDomain = (typeof ACADEMIC_DOMAINS)[number];

/** Her disiplinin çizdiği arketip (spec §1'deki branş listeleri). */
export const DOMAIN_ARCHETYPE: Record<AcademicDomain, VisualArchetype> = {
  medicine: "MEDICAL_BIOLOGY_PATHWAY",
  dentistry: "MEDICAL_BIOLOGY_PATHWAY",
  pharmacy: "MEDICAL_BIOLOGY_PATHWAY",
  biology: "MEDICAL_BIOLOGY_PATHWAY",
  physics: "ENGINEERING_PHYSICS_MECHANICS",
  engineering: "ENGINEERING_PHYSICS_MECHANICS",
  chemistry: "ENGINEERING_PHYSICS_MECHANICS",
  architecture: "ARCHITECTURE_SPATIAL_BLUEPRINT",
  interior_architecture: "ARCHITECTURE_SPATIAL_BLUEPRINT",
  civil_engineering: "ARCHITECTURE_SPATIAL_BLUEPRINT",
  art_history: "ARCHITECTURE_SPATIAL_BLUEPRINT",
  law: "LAW_SOCIAL_FLOWCHART",
  kpss: "LAW_SOCIAL_FLOWCHART",
  constitution: "LAW_SOCIAL_FLOWCHART",
  history: "LAW_SOCIAL_FLOWCHART",
  philosophy: "LAW_SOCIAL_FLOWCHART",
  social_science: "LAW_SOCIAL_FLOWCHART",
  literature: "LAW_SOCIAL_FLOWCHART",
  mathematics: "MATH_ALGORITHMIC_GRAPH",
  geometry: "MATH_ALGORITHMIC_GRAPH",
  algorithm: "MATH_ALGORITHMIC_GRAPH",
  statistics: "MATH_ALGORITHMIC_GRAPH",
  economics: "MATH_ALGORITHMIC_GRAPH",
  document_figure: "DOCUMENT_FIGURE_SPOTLIGHT",
  general: "LAW_SOCIAL_FLOWCHART",
};

/** Öğrenciye görünen kısa disiplin adı (sahne rozetinde). */
export const DOMAIN_LABEL: Record<AcademicDomain, string> = {
  medicine: "Tıp",
  dentistry: "Diş Hekimliği",
  pharmacy: "Eczacılık",
  biology: "Biyoloji",
  physics: "Fizik",
  engineering: "Mühendislik",
  chemistry: "Kimya",
  architecture: "Mimarlık",
  interior_architecture: "İç Mimarlık",
  civil_engineering: "İnşaat",
  art_history: "Sanat Tarihi",
  law: "Hukuk",
  kpss: "KPSS",
  constitution: "Anayasa",
  history: "Tarih",
  philosophy: "Felsefe",
  social_science: "Sosyal Bilimler",
  literature: "Edebiyat",
  mathematics: "Matematik",
  geometry: "Geometri",
  algorithm: "Algoritma",
  statistics: "İstatistik",
  economics: "İktisat",
  document_figure: "Belgendeki Şekil",
  general: "Genel",
};

export const ARCHETYPE_LABEL: Record<VisualArchetype, string> = {
  MEDICAL_BIOLOGY_PATHWAY: "Mekanizma Zinciri",
  ENGINEERING_PHYSICS_MECHANICS: "Kuvvet ve Vektör Diyagramı",
  ARCHITECTURE_SPATIAL_BLUEPRINT: "Teknik Pafta",
  LAW_SOCIAL_FLOWCHART: "Karar Akışı",
  MATH_ALGORITHMIC_GRAPH: "Grafik ve Dönüşüm",
  DOCUMENT_FIGURE_SPOTLIGHT: "Belgendeki Şekil",
};

export function isVisualArchetype(value: unknown): value is VisualArchetype {
  return typeof value === "string" && (VISUAL_ARCHETYPES as readonly string[]).includes(value);
}

export function isAcademicDomain(value: unknown): value is AcademicDomain {
  return typeof value === "string" && (ACADEMIC_DOMAINS as readonly string[]).includes(value);
}

/** Türkçe katlama: küçük harf, aksan farkı yok (İ/ı, ş, ğ … aynı kök). */
export function foldTr(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[âà]/g, "a")
    .replace(/[îì]/g, "i")
    .replace(/[ûù]/g, "u");
}

type Cue = { domain: AcademicDomain; exam?: RegExp; words: RegExp };

/*
  Anahtar aileleri katlanmış metinde aranır (\b yerine harf olmayan sınır: Türkçe ekler kökün arkasına gelir).
  `exam`: hazırlık adında sınav kodu (güçlü sinyal). `words`: disiplinin terimleri.
*/
const CUES: Cue[] = [
  { domain: "medicine", exam: /(^|[^a-z])(tus|tip fakultesi|usmle)([^a-z]|$)/, words: /(patofizyoloji|klinik|hasta|tani|tedavi|sendrom|semptom|enfeksiyon|kardiy|nefro|hepat|onkoloji|farmakoloji|patoloji|fizyoloji|anatomi|histoloji|biyokimya|mikrobiyoloji|immun|hormon|reseptor|enzim|inhibit|kinaz|sitokin|ilac|doz|kan basinci|bobrek|karaciger|kalp|akciger|noron|nobet|dahiliye|pediatri|cerrahi)/ },
  { domain: "dentistry", exam: /(^|[^a-z])(dus|dis hekimligi)([^a-z]|$)/, words: /(dis |dislerin|periodont|endodont|ortodont|protez|pulpa|mine |dentin|cürük|curuk|gingiva|okluzyon)/ },
  { domain: "pharmacy", exam: /(^|[^a-z])(eus|eczacilik)([^a-z]|$)/, words: /(farmakokinetik|farmakodinamik|eczaci|recete|etken madde|biyoyararlanim)/ },
  { domain: "biology", words: /(hucre|mitoz|mayoz|dna|rna|protein sentez|fotosentez|solunum|ekosistem|kalitim|gen |genetik|organel|zar |doku|organ|sindirim|dolasim|sinir sistemi|bitki|hayvan|canli|evrim|biyoloji)/ },
  { domain: "physics", words: /(kuvvet|hiz|ivme|momentum|enerji|is ve guc|basinc|kaldirma|akiskan|elektrik|akim|direnc|gerilim|manyetik|dalga|optik|isik|ses |newton|tork|denge|surtunme|yercekimi|kutle|agirlik|fizik|vektor|elektrostatik|termodinamik|isi ve sicaklik)/ },
  { domain: "engineering", exam: /(^|[^a-z])(muhendislik|kpss a.*teknik)([^a-z]|$)/, words: /(mukavemet|statik|dinamik|devre|transistor|sinyal|kontrol sistem|malzeme|gerilme|kiris|makine|termodinamik|akiskanlar mekanigi|elektronik)/ },
  { domain: "chemistry", words: /(mol |molekul|atom|iyon|bag |kimyasal|tepkime|asit|baz|ph |cozelti|derisim|gaz yasa|periyodik|elektron|organik|kimya|redoks|tuz |karisim)/ },
  { domain: "architecture", exam: /(^|[^a-z])(mimarlik|mimari)([^a-z]|$)/, words: /(mimar|cephe|kesit|plan |pafta|aks |tasiyici|kolon|doseme|yapi elemani|aciklik|kubbe|kemer|tonoz|revak|avlu|iç mekan|ic mekan|gotik|barok|romanesk|selcuklu mimari|osmanli mimari)/ },
  { domain: "interior_architecture", words: /(ic mimar|mobilya|mekan tasarim|aydinlatma tasarim|ergonomi)/ },
  { domain: "civil_engineering", words: /(insaat|betonarme|temel |zemin|yuk aktarimi|deprem yonetmeli|celik yapi|perde duvar)/ },
  { domain: "art_history", words: /(sanat tarihi|ressam|heykel|uslup|ronesans|empresyon|minyatur|cini|hat sanati)/ },
  { domain: "constitution", words: /(anayasa|tbmm|meclis|milletvekili|cumhurbaskani|nitelikli cogunluk|salt cogunluk|uye tamsayisi|referandum|kanun teklifi|anayasa mahkemesi|yasama|yurutme|yargi)/ },
  { domain: "law", exam: /(^|[^a-z])(hukuk|hakimlik|avukatlik|adli)([^a-z]|$)/, words: /(hukuk|dava|mahkeme|kanun|yonetmelik|sozlesme|borclar|ceza|idari|zaman asimi|hak dusurucu|istisna|tazminat|temyiz|itiraz|hukum|mulkiyet|miras|tuzel kisi|gercek kisi|ehliyet)/ },
  { domain: "kpss", exam: /(^|[^a-z])(kpss)([^a-z]|$)/, words: /(vatandaslik|guncel bilgiler|kamu personeli|devlet memurlari)/ },
  { domain: "history", words: /(tarih|osmanli|selcuklu|savas|antlasma|padisah|inkilap|cumhuriyet donemi|kurtulus savasi|devlet|imparatorluk|beylik|islahat|meşrutiyet|mesrutiyet|kronoloji)/ },
  { domain: "philosophy", words: /(felsefe|filozof|epistemoloji|ontoloji|etik|ahlak felsefesi|mantik|varlik|bilgi felsefesi|sokrates|platon|aristoteles|kant)/ },
  { domain: "social_science", words: /(sosyoloji|psikoloji|cografya|iklim|nufus|toplum|kultur|egitim bilimleri|rehberlik|ogrenme psikolojisi|gelisim)/ },
  { domain: "literature", words: /(edebiyat|siir|roman|hikaye|divan|tanzimat|servet-i funun|yazar|sair|nazim|nesir|dil bilgisi|paragraf|anlatim bozuklugu)/ },
  { domain: "statistics", words: /(istatistik|olasilik|ortalama|medyan|standart sapma|varyans|dagilim|histogram|regresyon|korelasyon|hipotez testi|orneklem)/ },
  { domain: "algorithm", words: /(algoritma|veri yapisi|dizi |siralama algoritma|ozyineleme|karmasiklik|graf |agac yapisi|programlama|kod |dongu|fonksiyon cagrisi)/ },
  { domain: "geometry", words: /(geometri|ucgen|aci |acilar|kenar|cember|daire|dortgen|cokgen|alan |cevre|benzerlik|pisagor|teget|kiris |prizma|kure|koni)/ },
  { domain: "economics", words: /(iktisat|ekonomi|arz|talep|fiyat|enflasyon|faiz|piyasa|maliyet|gelir|gsyh|para politikasi|esneklik|marjinal)/ },
  { domain: "mathematics", exam: /(^|[^a-z])(ales|dgs|tyt mat|ayt mat|matematik)([^a-z]|$)/, words: /(fonksiyon|denklem|esitsizlik|turev|integral|limit|logaritma|polinom|matris|sayi|kume|oran oranti|problem|us |koklu|mutlak deger|dizi|seri|parabol|grafik|egim)/ },
];

/** Kaynakta okunabilir tablo var mı: en az üç satır, satır başına en az iki ayraç (| ya da sekme ya da çoklu boşluk). */
export function detectSourceTable(pages: readonly { text: string }[]): { columns: string[]; rows: string[][] } | null {
  for (const page of pages) {
    const lines = page.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    let run: string[][] = [];
    const flush = (): { columns: string[]; rows: string[][] } | null => {
      if (run.length >= 3) {
        const width = run[0]!.length;
        const consistent = run.filter((cells) => cells.length === width);
        if (consistent.length >= 3 && width >= 2 && width <= 5) {
          return { columns: consistent[0]!, rows: consistent.slice(1, 6) };
        }
      }
      run = [];
      return null;
    };
    for (const line of lines) {
      const cells = line.includes("|")
        ? line.split("|").map((cell) => cell.trim()).filter(Boolean)
        : line.includes("\t")
          ? line.split("\t").map((cell) => cell.trim()).filter(Boolean)
          : line.split(/\s{3,}/).map((cell) => cell.trim()).filter(Boolean);
      const separator = /^[-:\s|]+$/.test(line);
      if (separator) continue;
      if (cells.length >= 2 && cells.every((cell) => cell.length <= 60)) run.push(cells);
      else {
        const found = flush();
        if (found) return found;
      }
    }
    const found = flush();
    if (found) return found;
  }
  return null;
}

export type DomainClassification = {
  academicDomain: AcademicDomain;
  visualArchetype: VisualArchetype;
  /** 0..1: en güçlü disiplinin skoru ile ikincinin farkı üzerinden. */
  confidence: number;
  /** Kaynakta tablo bulunduysa (belge şekli sahnesi için). */
  sourceTable: { columns: string[]; rows: string[][] } | null;
};

function countMatches(text: string, pattern: RegExp): number {
  const global = new RegExp(pattern.source, "g");
  return text.match(global)?.length ?? 0;
}

/**
 * Disiplini sınıflandırır. Ağırlık: hazırlık adındaki sınav kodu 6, konu adındaki terim 3, kaynak örneğindeki
 * terim 1 (en çok 6). Skor yoksa `general`. Belgeli derste kaynakta tablo var ve disiplin belirsizse
 * (`general` ya da güven < 0.25) arketip belge şekli olur.
 */
export function classifyAcademicDomain(input: {
  prepTitle?: string | null;
  topicLabel?: string | null;
  pages?: readonly { text: string }[];
  mode?: "document" | "topic";
}): DomainClassification {
  const prep = ` ${foldTr(input.prepTitle ?? "")} `;
  const topic = ` ${foldTr(input.topicLabel ?? "")} `;
  const sample = ` ${foldTr((input.pages ?? []).map((page) => page.text).join(" ").slice(0, 6000))} `;
  const scores = new Map<AcademicDomain, number>();
  for (const cue of CUES) {
    let score = 0;
    if (cue.exam && cue.exam.test(prep)) score += 6;
    score += Math.min(2, countMatches(topic, cue.words)) * 3;
    score += Math.min(2, countMatches(prep, cue.words)) * 1.5;
    score += Math.min(6, countMatches(sample, cue.words));
    if (score > 0) scores.set(cue.domain, (scores.get(cue.domain) ?? 0) + score);
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  const second = ranked[1]?.[1] ?? 0;
  const sourceTable = input.mode === "topic" ? null : detectSourceTable(input.pages ?? []);
  if (!top) {
    return sourceTable
      ? { academicDomain: "document_figure", visualArchetype: "DOCUMENT_FIGURE_SPOTLIGHT", confidence: 0.5, sourceTable }
      : { academicDomain: "general", visualArchetype: DOMAIN_ARCHETYPE.general, confidence: 0, sourceTable: null };
  }
  const confidence = Math.max(0, Math.min(1, (top[1] - second) / Math.max(1, top[1])));
  if (sourceTable && confidence < 0.25) {
    return { academicDomain: "document_figure", visualArchetype: "DOCUMENT_FIGURE_SPOTLIGHT", confidence, sourceTable };
  }
  return { academicDomain: top[0], visualArchetype: DOMAIN_ARCHETYPE[top[0]], confidence, sourceTable };
}
