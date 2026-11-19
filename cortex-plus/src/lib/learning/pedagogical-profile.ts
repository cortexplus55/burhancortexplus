/**
 * Evrensel seviye ve branş kalibrasyonu (20 Kasım 2026). Öğrencinin seviyesi (sınıf, hedef sınav) ve dersin doğası
 * (branş) her üretimde aynı tek fonksiyondan okunur: ders anlatımı, çizimli video, öğretmen sohbeti, "Farklı anlat",
 * konu testi, sözlü ve podcast. Saf ve deterministik: aynı girdi aynı profili ve aynı istem satırlarını verir; model
 * çağrısı yok.
 *
 * Dört seviye:
 *  1 — Ortaokul / LGS (5–8. sınıf, 11–14 yaş): sade, sıcak, somut; kısa cümle; jargon yok; az etiketli renkli görsel; 4 şık.
 *  2 — Lise / yazılı ve YKS (9–12. sınıf): MEB/ÖSYM kazanım dili, formülün sezgisi, sınav kısayolu, hafıza çivisi; 5 şık.
 *  3 — Üniversite lisans (vize / final / komite): akademik terim, türetim ve ispat mantığı, kuramsal çerçeve, vaka;
 *      hocanın puan kırdığı ayrıntı; teknik diyagram; 5 şık.
 *  4 — Uzmanlık ve mesleki sınavlar (TUS, DUS, KPSS, ALES, DGS, YDS, hâkimlik/kaymakamlık): yüksek bilgi yoğunluğu,
 *      ayırt edici tanı / istisna / karşılaştırma matrisi, spot tablo, zor çeldirici; 5 şık.
 *
 * Kaynak, doğruluk ve biçim kuralları seviyeden bağımsızdır; seviye yalnız dili, derinliği, örnek türünü ve görsel
 * yoğunluğu değiştirir. Sınav belli değilse sınıftan, o da yoksa hazırlığın adından; hiçbiri yoksa seviye 2 (lise),
 * en yaygın kullanıcı ve en güvenli orta yol.
 */

export type PedagogicalLevel = 1 | 2 | 3 | 4;

/** Dersin doğası: anlatım örneği ve görsel türü buna göre seçilir. */
export type SubjectDomain =
  | "mathematics"
  | "physics"
  | "chemistry"
  | "biology"
  | "medicine"
  | "engineering"
  | "architecture"
  | "law"
  | "economics"
  | "psychology"
  | "history"
  | "geography"
  | "literature"
  | "philosophy"
  | "language"
  | "computer_science"
  | "general";

export type VisualDensity = "simple" | "standard" | "technical" | "dense";

export type PedagogicalCalibrationProfile = {
  level: PedagogicalLevel;
  levelLabel: string;
  ageBand: string;
  optionCount: 4 | 5;
  subjectDomain: SubjectDomain;
  /** Anlatımın tonu ve cümle uzunluğu. */
  tone: string;
  /** Kelime hazinesi kısıtı. */
  vocabulary: string;
  /** Örnek türü. */
  examples: string;
  /** Derinlik: neyin açıklanması zorunlu. */
  depth: string;
  /** Bu dersin doğası: hangi anlatım ve görsel yapı. */
  subjectLine: string;
  visual: {
    density: VisualDensity;
    /** Bir sahnede en çok bu kadar etiketli öğe. */
    maxLabels: number;
    /** Yazı ölçeği (1 = varsayılan). Ortaokulda büyük yazı. */
    fontScale: number;
    /** Görsel üretim istemine giden tek cümle. */
    line: string;
  };
};

const LEVEL_SPEC: Record<PedagogicalLevel, Omit<PedagogicalCalibrationProfile, "level" | "optionCount" | "subjectDomain" | "subjectLine">> = {
  1: {
    levelLabel: "Ortaokul / LGS",
    ageBand: "11–14 yaş",
    tone: "Sıcak ve sade; cümleler kısa (en çok 15 kelime), her paragrafta tek fikir.",
    vocabulary: "Ağır akademik jargon ve cebir adı yok; yeni terim önce tanıdık bir örnekle açılır, sonra adı verilir.",
    examples: "Somut günlük hayat benzetmeleri (mutfak, oyun, alışveriş, okul yolu, terazi, sayı doğrusu).",
    depth: "Kavramın ne olduğu ve neye yaradığı; ispat ve türetim yok.",
    visual: {
      density: "simple",
      maxLabels: 5,
      fontScale: 1.15,
      line: "Görsel sade, renkli ve az etiketli (en çok 5 etiket, kısa sözcükler, büyük yazı); tek fikir tek resimde.",
    },
  },
  2: {
    levelLabel: "Lise / Yazılı ve YKS",
    ageBand: "15–18 yaş",
    tone: "Net ve öğretici; formülün ya da kuralın sezgisi önce, sonra sınavdaki kullanımı.",
    vocabulary: "MEB ve ÖSYM kazanım dili; terimler tam adıyla, ilk geçtiği yerde tek cümleyle açıklanır.",
    examples: "Sınavda sorulduğu biçimde kurulmuş örnek; pratik çözüm kısayolu ve görsel hafıza çivisi.",
    depth: "Formülün mantığı, sık yapılan hata ve ÖSYM çeldiricisinin nereden geldiği.",
    visual: {
      density: "standard",
      maxLabels: 8,
      fontScale: 1,
      line: "Görsel sınav odaklı: kilit büyüklükler etiketli (en çok 8 etiket), formülün parçaları renkle eşleşir.",
    },
  },
  3: {
    levelLabel: "Üniversite lisans",
    ageBand: "18+ (vize / final / komite)",
    tone: "Akademik ve kesin; gereksiz benzetme yok, adımlar gerekçeli.",
    vocabulary: "Akademik terminoloji (gerekirse özgün dildeki karşılığıyla); tanımlar kesin yazılır.",
    examples: "Türetim, ispat taslağı, kuramsal çerçeve ve uygulama vakası; hocanın klasik sınavda puan kırdığı ayrıntı.",
    depth: "Neden böyle olduğu (türetim/mekanizma), varsayımlar ve sınır durumlar.",
    visual: {
      density: "technical",
      maxLabels: 12,
      fontScale: 0.95,
      line: "Görsel teknik: üniversite düzeyi şema (katmanlar, birimler, ölçü ve yön işaretleri; en çok 12 etiket).",
    },
  },
  4: {
    levelLabel: "Uzmanlık ve mesleki sınav",
    ageBand: "Mezun / uzmanlık",
    tone: "Yoğun ve sınav odaklı; giriş yok, her cümle bir ayırt edici bilgi.",
    vocabulary: "Alanın tam teknik dili; kısaltmalar açılımıyla bir kez verilir.",
    examples: "Ayırt edici tanı / istisna / karşılaştırma matrisi, spot tablo ve yüksek zorluklu çeldirici analizi.",
    depth: "En sık, ilk tercih, istisna ve karıştırılan komşu kavramla fark; hız kazandıran kural.",
    visual: {
      density: "dense",
      maxLabels: 14,
      fontScale: 0.9,
      line: "Görsel yoğun: karşılaştırma matrisi ya da spot tablo; ayırt edici satırlar vurgulu (en çok 14 etiket).",
    },
  },
};

const SPECIALIST_EXAM = /(?:^|[^\p{L}])(?:tus|dus|kpss|ales|dgs|yds|yökdil|ydt|hakimlik|hâkimlik|kaymakamlık|savcılık|avukatlık sınavı|uzmanlık sınavı|tıpta uzmanlık|diş hekimliğinde uzmanlık)(?:$|[^\p{L}])/u;
const UNIVERSITY = /üniversite|universite|lisans|vize|final|komite|fakülte|bütünleme|ara sınav|midterm/u;
const MIDDLE_SCHOOL = /(?:^|[^\p{L}])lgs(?:$|[^\p{L}])|liseye geçiş|ortaokul/u;
const HIGH_SCHOOL = /(?:^|[^\p{L}])(?:yks|tyt|ayt|msü)(?:$|[^\p{L}])|lise|yazılı/u;

function fold(value: string | null | undefined): string {
  return (value ?? "").toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();
}

/** Sınav/program metninden seviye (bulunamazsa null). */
export function levelFromExam(examType: string | null | undefined): PedagogicalLevel | null {
  const text = fold(examType);
  if (!text) return null;
  if (SPECIALIST_EXAM.test(text)) return 4;
  if (MIDDLE_SCHOOL.test(text)) return 1;
  if (UNIVERSITY.test(text)) return 3;
  if (HIGH_SCHOOL.test(text)) return 2;
  return null;
}

/** Sınıf bilgisinden seviye: 5–8 ortaokul, 9–12 lise, "Üniversite" lisans, "Mezun" bilinmiyor (sınav belirler). */
export function levelFromGrade(gradeLevel: string | null | undefined): PedagogicalLevel | null {
  const text = fold(gradeLevel);
  if (!text) return null;
  if (UNIVERSITY.test(text)) return 3;
  if (text.includes("mezun")) return null;
  const n = Number.parseInt(text, 10);
  if (n >= 5 && n <= 8) return 1;
  if (n >= 9 && n <= 12) return 2;
  return null;
}

const DOMAIN_PATTERNS: [SubjectDomain, RegExp][] = [
  ["medicine", /tıp|tus|dus|anatomi|fizyoloji|patoloji|farmakoloji|pediatri|dahiliye|cerrahi|hemşirelik|diş hekim|mikrobiyoloji|biyokimya|klinik/u],
  ["computer_science", /bilgisayar|algoritma|programlama|yazılım|veri yapı|işletim sistem|veritaban|yapay zek/u],
  ["architecture", /mimarl|iç mimar|yapı statiği|şehir plan|peyzaj|restorasyon|sanat tarihi/u],
  ["engineering", /mühendis|mekanik|statik|dinamik|devre|elektronik|termodinamik|akışkan|mukavemet|inşaat/u],
  ["law", /hukuk|anayasa|ceza|medeni|borçlar|idare|vatandaşlık|hâkim|hakim|kaymakam|mevzuat|kanun/u],
  ["economics", /ekonomi|iktisat|muhasebe|maliye|işletme|finans|pazarlama|arz ve talep|arz-talep|enflasyon|gsyh/u],
  ["psychology", /psikoloji|rehberlik|gelişim|öğrenme psikoloji|sosyoloji/u],
  ["history", /tarih|inkılap|atatürk|osmanlı|uygarlık/u],
  ["geography", /coğrafya|iklim|harita|nüfus/u],
  ["literature", /edebiyat|türk dili|dil ve anlatım|şiir|roman|paragraf|türkçe/u],
  ["philosophy", /felsefe|mantık|etik|din kültürü/u],
  ["language", /ingilizce|almanca|fransızca|arapça|yabancı dil|yds|yökdil|ydt|grammar|vocabulary/u],
  ["chemistry", /kimya|tepkime|mol|asit|baz|organik/u],
  ["physics", /fizik|kuvvet|hareket|elektrik|manyetizma|optik|dalga|basınç|enerji/u],
  ["biology", /biyoloji|hücre|genetik|ekoloji|sistemler|canlı/u],
  ["mathematics", /matematik|geometri|türev|integral|limit|fonksiyon|olasılık|istatistik|sayı|cebir|trigonometri/u],
];

/** Ders / hazırlık adından branş (bulunamazsa "general"). Sıra önemli: özel alan genelden önce. */
export function subjectDomainOf(subject: string | null | undefined): SubjectDomain {
  const text = fold(subject);
  if (!text) return "general";
  for (const [domain, pattern] of DOMAIN_PATTERNS) if (pattern.test(text)) return domain;
  return "general";
}

const SUBJECT_LINES: Record<SubjectDomain, Record<"intro" | "academic", string>> = {
  mathematics: {
    intro: "Matematik: önce sezgi (şekil, sayı doğrusu, örnek değer), sonra kural; işlem adımları tek tek.",
    academic: "Matematik: tanım–teorem–ispat taslağı; varsayımlar ve tanım kümesi açık; grafik eksen ve kritik noktalarıyla.",
  },
  physics: {
    intro: "Fizik: olayı günlük bir durumla aç, kuvvetleri ok gibi düşün; formülün her harfinin ne olduğu söylenir.",
    academic: "Fizik: serbest cisim diyagramı, korunum yasaları ve türetim; birim analizi ve yaklaşım varsayımları.",
  },
  chemistry: {
    intro: "Kimya: tanecik modeliyle anlat; tepkimeyi önce sözle, sonra denklemle.",
    academic: "Kimya: mekanizma, denge ve enerji profili; denkleşmiş tepkime ve koşullar.",
  },
  biology: {
    intro: "Biyoloji: süreç adım adım (önce → sonra); yapı ile görev eşlenir.",
    academic: "Biyoloji: düzenlenme mekanizmaları, deney kanıtı ve karşılaştırma tablosu.",
  },
  medicine: {
    intro: "Tıp: mekanizma zinciri (uyaran → yanıt → bulgu) ve klinik karşılığı.",
    academic: "Tıp: patofizyoloji, ayırıcı tanı, en sık / ilk tercih / altın standart; vaka üzerinden.",
  },
  engineering: {
    intro: "Mühendislik: sistemi parçalara ayır, giriş–çıkışı göster.",
    academic: "Mühendislik: model varsayımları, denge denklemleri, birimler ve tasarım ölçütü.",
  },
  architecture: {
    intro: "Mimarlık: plan, kesit ve görünüşü günlük mekânla eşle.",
    academic: "Mimarlık: plan / kesit / görünüş ölçekli, taşıyıcı sistem ve malzeme katmanlarıyla; numaralı açıklama pinleri.",
  },
  law: {
    intro: "Hukuk: kuralı bir olayla anlat; kim, neyi, hangi koşulda.",
    academic: "Hukuk: unsur–şart–sonuç ve istisna; madde metni, çoğunluk/oran şartları ve karşılaştırma tablosu.",
  },
  economics: {
    intro: "Ekonomi: arz ve talebi pazar yeri örneğiyle; değişkenin yönünü ok ile göster.",
    academic: "Ekonomi: model (eğri kayması, denge), varsayımlar, esneklik ve politika etkisi.",
  },
  psychology: {
    intro: "Psikoloji: kavramı günlük bir davranışla örnekle.",
    academic: "Psikoloji: kuram, kuramcı, deney/kanıt ve karşılaştırma matrisi.",
  },
  history: {
    intro: "Tarih: zaman çizelgesi ve neden–sonuç; olayı kişiler ve yerlerle bağla.",
    academic: "Tarih: neden–sonuç ağı, dönemleştirme ve kaynak eleştirisi; karşılaştırmalı tablo.",
  },
  geography: {
    intro: "Coğrafya: haritada yer ve günlük yaşama etkisi.",
    academic: "Coğrafya: süreç (iklim, nüfus, ekonomi) etkileşimi, veri ve harita okuma.",
  },
  literature: {
    intro: "Edebiyat / dil: örnek metin üzerinden kural; terim örnekle birlikte.",
    academic: "Edebiyat: dönem–akım–yazar–eser matrisi, metin çözümleme ölçütleri.",
  },
  philosophy: {
    intro: "Felsefe: soruyu günlük bir ikilemle aç; kavramları karşılaştır.",
    academic: "Felsefe: argüman yapısı (öncül → sonuç), filozof–görüş–eleştiri matrisi.",
  },
  language: {
    intro: "Yabancı dil: kalıbı örnek cümleyle, Türkçe karşılığıyla; kural kısa.",
    academic: "Yabancı dil: yapı ve kullanım bağlamı, sık karıştırılan yapılar karşılaştırmalı; sınav soru tipleri.",
  },
  computer_science: {
    intro: "Bilgisayar: algoritmayı adım adım izle, küçük bir girdiyle çalıştır.",
    academic: "Bilgisayar bilimleri: karmaşıklık, değişmez (invariant), sözde kod ve sınır durumları.",
  },
  general: {
    intro: "Konuyu yapısına göre anlat: süreç ise akış, kavramlar ise karşılaştırma, olaylar ise neden–sonuç.",
    academic: "Konuyu yapısına göre anlat: süreç akışı, karşılaştırma matrisi, katmanlı yapı ya da neden–sonuç ağı.",
  },
};

/**
 * Seviye ve branş profili. Öncelik: sınav metni (en belirleyici), sonra sınıf, sonra hazırlık/ders adı; hiçbiri
 * yoksa seviye 2.
 */
export function resolvePedagogicalProfile(
  gradeLevel: string | null | undefined,
  examType: string | null | undefined,
  subjectDomain?: SubjectDomain | string | null,
): PedagogicalCalibrationProfile {
  const level: PedagogicalLevel = levelFromExam(examType) ?? levelFromGrade(gradeLevel) ?? levelFromExam(gradeLevel) ?? 2;
  const domain: SubjectDomain =
    typeof subjectDomain === "string" && subjectDomain in SUBJECT_LINES
      ? (subjectDomain as SubjectDomain)
      : subjectDomainOf(typeof subjectDomain === "string" ? subjectDomain : examType);
  const spec = LEVEL_SPEC[level];
  return {
    level,
    optionCount: level === 1 ? 4 : 5,
    subjectDomain: domain,
    subjectLine: SUBJECT_LINES[domain][level <= 2 ? "intro" : "academic"],
    ...spec,
    visual: { ...spec.visual },
  };
}

export type CalibrationSurface = "lesson" | "video" | "chat" | "reexplain" | "quiz" | "oral" | "podcast";

const SURFACE_NOTE: Record<CalibrationSurface, string> = {
  lesson: "Ders ekranlarında bu seviyenin dili, örneği ve derinliği.",
  video: "Çizimli videonun anlatımı ve sahneleri bu seviyede.",
  chat: "Öğretmen cevapları bu seviyenin dilinde.",
  reexplain: "Farklı anlatım bu seviyenin dilinde ve örnek türünde.",
  quiz: "Soru kökleri ve çeldiriciler bu seviyede.",
  oral: "Sözlü sorular ve beklenen cevap derinliği bu seviyede.",
  podcast: "Konuşmanın örnekleri ve derinliği bu seviyede.",
};

/**
 * İstemin sonuna eklenen kalibrasyon bloğu (deterministik). Kaynak ve doğruluk kurallarını değiştirmez; yazar ve
 * denetçi aynı metni okur.
 */
export function pedagogicalCalibrationBlock(profile: PedagogicalCalibrationProfile, surface: CalibrationSurface): string {
  const lines = [
    `SEVİYE KALİBRASYONU: ${profile.levelLabel} (${profile.ageBand}). ${SURFACE_NOTE[surface]}`,
    `Ton: ${profile.tone}`,
    `Kelime: ${profile.vocabulary}`,
    `Örnek: ${profile.examples}`,
    `Derinlik: ${profile.depth}`,
    `Branş: ${profile.subjectLine}`,
  ];
  if (surface === "lesson" || surface === "video") lines.push(`Görsel: ${profile.visual.line}`);
  if (surface === "quiz") lines.push(`Şık sayısı: ${profile.optionCount} (${profile.optionCount === 4 ? "A–D" : "A–E"}).`);
  lines.push("Kaynak, doğruluk ve biçim kuralları seviyeden bağımsızdır; seviye yalnız dili, derinliği ve örnek türünü değiştirir.");
  return lines.join("\n");
}

/**
 * Kalibrasyon bloğundan seviye (20 Kasım 2026): motor kabukları bloğu metin olarak taşır; görsel sahneye seviye modelin
 * tahmininden değil bu bloktan yazılır. Blok yoksa ya da tanınmazsa null (sahne seviyesiz, eski çizim).
 */
export function levelFromCalibrationBlock(block: string | null | undefined): PedagogicalLevel | null {
  const match = block?.match(/SEVİYE KALİBRASYONU: ([^(\n]+?) \(/u);
  if (!match) return null;
  const label = match[1]!.trim();
  for (const level of [1, 2, 3, 4] as const) {
    if (LEVEL_SPEC[level].levelLabel === label) return level;
  }
  return null;
}
