/**
 * Görsel şölen motoru (19 Kasım 2026, Faz 1-B): branş arketipleri ve disiplin sınıflandırıcısı.
 *
 * Ders (`LessonV3`) ve 1 dk çizimli video (`sketch_reel`) aynı arketiplerden birini çizer. Disiplin kodla, model
 * çağrısı olmadan sınıflandırılır (hazırlık adı + konu adı + kaynaktan kısa örnek); yazar istemine "bu konunun
 * arketipi şu" diye verilir, model o arketipin verisini yazar. Sınıflandırma ders adına bağlı değildir: anahtar
 * kelime aileleri disiplinin kendisini tarif eder.
 *
 * 20 Kasım 2026: tarih, edebiyat, felsefe, iktisat, psikoloji, coğrafya, yabancı dil ve genel dersler karar ağacına
 * değil kavram yapısı sahnesine (`CONCEPT_STRUCTURE_VISUALIZER`) gider; hukuk/sosyal karar ağacı istisna uydurmaya
 * itilmez.
 */

export const VISUAL_ARCHETYPES = [
  "MEDICAL_BIOLOGY_PATHWAY",
  "ENGINEERING_PHYSICS_MECHANICS",
  "ARCHITECTURE_SPATIAL_BLUEPRINT",
  "LAW_SOCIAL_FLOWCHART",
  "MATH_ALGORITHMIC_GRAPH",
  "DOCUMENT_FIGURE_SPOTLIGHT",
  "CONCEPT_STRUCTURE_VISUALIZER",
] as const;
export type VisualArchetype = (typeof VISUAL_ARCHETYPES)[number];

/** Kavram yapısı sahnesinin altı biçimi. */
export const CONCEPT_STRUCTURES = ["process", "matrix", "pyramid", "timeline", "cause_effect", "supply_demand"] as const;
export type ConceptStructure = (typeof CONCEPT_STRUCTURES)[number];
export const CONCEPT_STRUCTURE_LABEL: Record<ConceptStructure, string> = {
  process: "Süreç Akışı",
  matrix: "Karşılaştırma Matrisi",
  pyramid: "Katmanlı Piramit",
  timeline: "Zaman Çizelgesi",
  cause_effect: "Neden-Sonuç Ağı",
  supply_demand: "Arz-Talep Grafiği",
};

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
  "psychology",
  "geography",
  "literature",
  "language",
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
  social_science: "LAW_SOCIAL_FLOWCHART",
  history: "CONCEPT_STRUCTURE_VISUALIZER",
  philosophy: "CONCEPT_STRUCTURE_VISUALIZER",
  psychology: "CONCEPT_STRUCTURE_VISUALIZER",
  geography: "CONCEPT_STRUCTURE_VISUALIZER",
  literature: "CONCEPT_STRUCTURE_VISUALIZER",
  language: "CONCEPT_STRUCTURE_VISUALIZER",
  economics: "CONCEPT_STRUCTURE_VISUALIZER",
  mathematics: "MATH_ALGORITHMIC_GRAPH",
  geometry: "MATH_ALGORITHMIC_GRAPH",
  algorithm: "MATH_ALGORITHMIC_GRAPH",
  statistics: "MATH_ALGORITHMIC_GRAPH",
  document_figure: "DOCUMENT_FIGURE_SPOTLIGHT",
  general: "CONCEPT_STRUCTURE_VISUALIZER",
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
  psychology: "Psikoloji",
  geography: "Coğrafya",
  literature: "Edebiyat",
  language: "Yabancı Dil",
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
  CONCEPT_STRUCTURE_VISUALIZER: "Kavram Yapısı",
};

/** Mekanik arketipinin kuvvet olmayan (eğilim/yön) sahnesi: aynı bileşen, kuvvet dili yerine bu ad. */
export const MECHANICS_TREND_LABEL = "Eğilim ve Yön Diyagramı";

/**
 * Sahnenin rozet/erişilebilirlik adı: mekanikte `setting: "trend"` ise eğilim adı, kavram yapısında yapının adı
 * (süreç, matris, piramit …).
 */
export function sceneArchetypeLabel(scene: { archetype: VisualArchetype; setting?: string; structure?: string }): string {
  if (scene.archetype === "ENGINEERING_PHYSICS_MECHANICS" && scene.setting === "trend") return MECHANICS_TREND_LABEL;
  if (scene.archetype === "CONCEPT_STRUCTURE_VISUALIZER" && scene.structure && scene.structure in CONCEPT_STRUCTURE_LABEL) {
    return CONCEPT_STRUCTURE_LABEL[scene.structure as ConceptStructure];
  }
  return ARCHETYPE_LABEL[scene.archetype];
}

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

/**
 * Sözcük başında eşleşen kök ailesi (20 Kasım 2026): kökün önünde harf ya da rakam olamaz, arkasına Türkçe ek
 * gelebilir. Eskiden kökler alt dize olarak aranıyordu: "arz" "tarz"da, "iyon" "versiyon"da, "etik" "genetik"te
 * eşleşiyordu. Ek alamayan kök `(?![a-z])` ile, ekle başka sözcüğe dönen kök negatif ileri bakışla yazılır
 * ("doku" ≠ "dokuz", "organ" ≠ "organizasyon", "hiz" ≠ "hizmet", "tani" ≠ "tanım").
 */
function cueWords(...roots: string[]): RegExp {
  return new RegExp(`(?<![a-z0-9])(?:${roots.join("|")})`);
}

/** "x" tam sözcük: arkasına harf gelmez. */
const whole = (root: string) => `${root}(?![a-z])`;

/*
  Anahtar aileleri katlanmış metinde aranır. `exam`: hazırlık adında sınav kodu (güçlü sinyal). `words`: disiplinin
  terimleri. Aynı yazılan iki anlam (ör. "gelir" isim/fiil, "temel" yapı/sıfat, "tarih" bilim/gün) yalnız ayırt edici
  bileşikle sayılır.
*/
const CUES: Cue[] = [
  {
    domain: "medicine",
    exam: /(^|[^a-z])(tus|tip fakultesi|usmle)([^a-z]|$)/,
    words: cueWords(
      "patofizyoloji", "klinik", "hasta", "tani(?!m|t|yor|yan|yabil|yacak|nir|nma|nan|nab|nd)", "tedavi", "sendrom", "semptom",
      "enfeksiyon", "kardiy", "nefro", "hepat", "onkoloji", "farmakoloji", "patoloji", "fizyoloji", "anatomi", "histoloji",
      "biyokimya", "mikrobiyoloji", "immun", "otoimmun", "hormon", "reseptor", "enzim", "inhibit", "kinaz", "sitokin", "ilac",
      "doz(?!er)", "kan basinci", "bobrek", "karaciger", "kalp", "akciger", "noron", "nobet", "dahiliye", "pediatri", "cerrahi",
    ),
  },
  {
    domain: "dentistry",
    exam: /(^|[^a-z])(dus|dis hekimligi)([^a-z]|$)/,
    words: cueWords("dislerin", "dis hekim", "dis eti", "periodont", "endodont", "ortodont", "protez", "pulpa", whole("mine"), "dentin", "curuk", "gingiva", "okluzyon"),
  },
  {
    domain: "pharmacy",
    exam: /(^|[^a-z])(eus|eczacilik)([^a-z]|$)/,
    words: cueWords("farmakokinetik", "farmakodinamik", "eczaci", "recete", "etken madde", "biyoyararlanim"),
  },
  {
    domain: "biology",
    words: cueWords(
      "hucre", "mitoz", "mayoz", whole("dna"), whole("rna"), "protein sentez", "fotosentez", "solunum", "ekosistem", "kalitim",
      whole("gen"), "genetik", "organel", whole("zar"), "doku(?!z|nm|nur|nul|nab|nd)", "organ(?!iz|ik)", "sindirim", "dolasim",
      "sinir sistemi", "bitki", "hayvan", "canli", "evrim", "biyoloji",
    ),
  },
  {
    domain: "physics",
    words: cueWords(
      "kuvvet", "hiz(?!met|a)", "ivme", "momentum", "enerji", "is ve guc", "basinc", "kaldirma", "akiskan", "elektrik",
      "(?<!(?:edebi|sanat|dusunce|felsefi|fikir) )akim", "direnc", "gerilim", "manyetik", "dalga", "optik", "isik",
      whole("ses"), "ses(?:in|i|ler)(?![a-z])", "newton", "tork", "denge", "surtunme", "yercekimi", "kutle",
      "(?<!(?:puan|sinav|soru) )agirlik", "fizik", "vektor", "elektrostatik", "termodinamik", "isi ve sicaklik",
    ),
  },
  {
    domain: "engineering",
    exam: /(^|[^a-z])(muhendislik|kpss a.*teknik)([^a-z]|$)/,
    words: cueWords("mukavemet", "statik", "dinamik", "devre", "transistor", "sinyal", "kontrol sistem", "malzeme", "gerilme", "kiris", "makine", "termodinamik", "akiskanlar mekanigi", "elektronik"),
  },
  {
    domain: "chemistry",
    words: cueWords(
      whole("mol"), "molekul", "atom", "iyon", whole("bag"), "kimyasal", "tepkime", "asit", whole("baz"), "bazlar", "bazik", whole("ph"),
      "cozelti", "derisim", "gaz yasa", "periyodik", "elektron(?!ik)", "organik", "kimya", "redoks", whole("tuz"), "karisim",
    ),
  },
  {
    domain: "architecture",
    exam: /(^|[^a-z])(mimarlik|mimari)([^a-z]|$)/,
    words: cueWords(
      "mimar", "(?<!(?:dogu|bati|guney|kuzey|savas|kafkas|canakkale|irak|suriye|filistin|sark|garp) )cephe", "kesit",
      "(?<!(?:calisma|ders|is|egitim|eylem|tatil|gezi|tedavi|bakim|bireysel|yillik|gunluk|haftalik|aylik|kalkinma|yillik) )plan(?!la|c|li)",
      "pafta", whole("aks"), "tasiyici", "kolon(?!i|y)", "doseme", "yapi elemani", "aciklik", "kubbe", "kemer", "tonoz", "revak",
      "avlu", "ic mekan", "gotik", "barok", "romanesk", "selcuklu mimari", "osmanli mimari",
    ),
  },
  { domain: "interior_architecture", words: cueWords("ic mimar", "mobilya", "mekan tasarim", "aydinlatma tasarim", "ergonomi") },
  {
    domain: "civil_engineering",
    words: cueWords(
      "insaat", "betonarme", "temel (?:kazi|sistem|tip|tasarim|zemin|hesab|eleman)", "(?:radye|tekil|surekli|kazikli|yuzeysel|derin|munferit) temel",
      "zemin (?:etud|sinif|iyilestir|mekanig)", "yuk aktarimi", "deprem yonetmeli", "celik yapi", "perde duvar",
    ),
  },
  { domain: "art_history", words: cueWords("sanat tarihi", "ressam", "heykel", "uslup", "ronesans", "empresyon", "minyatur", "cini", "hat sanati") },
  {
    domain: "constitution",
    words: cueWords("anayasa", "tbmm", "meclis", "milletvekili", "cumhurbaskani", "nitelikli cogunluk", "salt cogunluk", "uye tamsayisi", "referandum", "kanun teklifi", "anayasa mahkemesi", "yasama", "yurutme", "yargi"),
  },
  {
    domain: "law",
    exam: /(^|[^a-z])(hukuk|hakimlik|avukatlik|adli)([^a-z]|$)/,
    words: cueWords(
      "hukuk", "dava", "mahkeme", "kanun", "yonetmelik", "sozlesme", "borclar", "ceza(?!yir)", "idari", "zaman asimi", "hak dusurucu",
      "istisna", "tazminat", "temyiz", "itiraz", "hukum(?!et)", "mulkiyet", "miras", "tuzel kisi", "gercek kisi", "ehliyet",
    ),
  },
  { domain: "kpss", exam: /(^|[^a-z])(kpss)([^a-z]|$)/, words: cueWords("vatandaslik", "guncel bilgiler", "kamu personeli", "devlet memurlari") },
  {
    domain: "history",
    words: cueWords(
      "(?<!(?:sinav|teslim|son|basvuru|odev|dogum|bitis|baslangic|vize|final|kayit|randevu|hedef|cikis|yayin|sanat) )tarih(?!li|siz|lendir)",
      "osmanli", "selcuklu", "savas", "antlasma", "padisah", "inkilap", "cumhuriyet donemi", "kurtulus savasi", "devlet", "imparatorluk",
      "beylik", "islahat", "mesrutiyet", "kronoloji", "divan-?i humayun",
    ),
  },
  {
    domain: "philosophy",
    words: cueWords("felsefe", "filozof", "epistemoloji", "ontoloji", "etik(?!et)", "ahlak felsefesi", "mantik", "varlik", "bilgi felsefesi", "sokrates", "platon", "aristoteles", whole("kant")),
  },
  { domain: "social_science", words: cueWords("sosyoloji", "toplum", "kultur", "egitim bilimleri", "sosyal bilim", "sosyal yapi") },
  {
    domain: "psychology",
    words: cueWords(
      "psikoloji", "psikolog", "rehberlik", "gelisim (?:donem|kuram|evre|psikoloji)", "bilissel", "davranisci", "kosullanma", "pekistir",
      "bellek", "motivasyon", "kisilik", "freud", "piaget", "maslow", "erikson", "bilincalti", whole("algi"), "algilar",
    ),
  },
  {
    domain: "geography",
    words: cueWords(
      "cografya", "iklim", "nufus", "harita", "enlem", "boylam", "yer sekil", "akarsu", "ruzgar", "yagis", "bitki ortusu", "toprak tur",
      "tektonik", "volkan", "levha", "goc(?![a-z])", "gocler",
    ),
  },
  {
    domain: "literature",
    words: cueWords(
      "edebiyat", "edebi", "siir", "roman(?!esk|ya)", "hikaye", "divan(?!-?i humayun)", "tanzimat", "servet-i funun", "yazar(?!ak|ken|sa)",
      "sair", "nazim", "nesir", "dil bilgisi", "paragraf", "anlatim bozuklugu",
    ),
  },
  {
    domain: "language",
    exam: /(^|[^a-z])(yds|yokdil|ydt|toefl|ielts|ingilizce|almanca|fransizca)([^a-z]|$)/,
    words: cueWords(
      "ingilizce", "almanca", "fransizca", "arapca", "ispanyolca", "italyanca", "rusca", "yabanci dil", whole("yds"), "yokdil", whole("ydt"),
      "grammar", "vocabulary", whole("tense"), "present perfect", "past simple", "phrasal verb", "preposition", "conditional", "kelime bilgisi",
    ),
  },
  {
    domain: "statistics",
    words: cueWords("istatistik", "olasilik", "ortalama", "medyan", "standart sapma", "varyans", "(?<!(?:gelir|nufus|servet) )dagilim", "histogram", "regresyon", "korelasyon", "hipotez testi", "orneklem"),
  },
  {
    domain: "algorithm",
    words: cueWords("algoritma", "veri yapisi", whole("dizi"), "siralama algoritma", "ozyineleme", "karmasiklik", whole("graf"), "agac yapisi", "programlama", whole("kod"), "dongu", "fonksiyon cagrisi"),
  },
  {
    domain: "geometry",
    words: cueWords(
      "geometri", "ucgen", whole("aci"), "acilar", "kenar", "cember", "daire(?!si|nin| baskan)", "dortgen", "cokgen",
      "(?<!(?:calisma|is|yasam|uzmanlik|ilgi|bilgi) )alan(?:i|in)?(?![a-z])", "cevre(?![a-z])(?! (?:kirlil|sorun|koru|bilim|duzenle))",
      "benzerlik", "pisagor", "teget", whole("kiris"), "prizma", "kure(?!sel)", "koni",
    ),
  },
  {
    domain: "economics",
    words: cueWords(
      "iktisat", "ekonomi", "arz(?!u)", "talep", "fiyat", "enflasyon", "faiz", "piyasa", "maliyet",
      "(?:milli|ulusal|kisi basina|toplam|kamu|vergi|faiz|marjinal|reel|nominal|kisisel|harcanabilir) gelir",
      "gelir (?:dagilim|vergi|esneklig|etkisi|grub|duzey|seviye|artis|azalis|politika|dengesizlig|tablosu|elastik)",
      whole("gsyh"), "para politikasi", "esneklik", "marjinal", "resesyon", "issizlik", "ithalat", "ihracat", "doviz",
    ),
  },
  {
    domain: "mathematics",
    exam: /(^|[^a-z])(ales|dgs|tyt mat|ayt mat|matematik)([^a-z]|$)/,
    words: cueWords(
      "fonksiyon", "denklem", "esitsizlik", "turev", "integral", "limit", "logaritma", "polinom", "matris",
      "(?:tam|dogal|rasyonel|irrasyonel|reel|asal|karmasik|tek|cift) sayi", "sayi dogrusu", "sayilar(?![a-z])", "kume(?:si|ler|leri)?(?![a-z])",
      "diziler(?![a-z])",
      "oran oranti", "problem(?:ler|leri)?(?![a-z])", whole("us"), "koklu", "mutlak deger", whole("seri"), "parabol", "grafik", "egim",
    ),
  },
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
