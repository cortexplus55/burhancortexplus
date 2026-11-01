import type { StudyModality } from "@/lib/learning/exam-prep-ui-path";

/**
 * PDF sonrası sihirbaz ve hazırlık evi kopyası.
 * Bileşenler bu sabitleri kullanır; metin ikinci bir yerde yazılmaz.
 */
/** Hedef sınav türü. `exam_type` ders adı olarak kalır; bu alan tercihlerin içine yazılır. */
export const EXAM_TRACKS = [
  // Sıra (2 Kasım 2026): okul yolundaki sırayla — LGS, YKS oturumları, lisans sonrası sınavlar, üniversite.
  { id: "lgs", label: "LGS" },
  { id: "tyt", label: "TYT" },
  { id: "ayt", label: "AYT" },
  { id: "yks", label: "YKS (TYT+AYT)" },
  { id: "kpss", label: "KPSS" },
  { id: "ales", label: "ALES" },
  { id: "tus", label: "TUS" },
  { id: "uni", label: "Üniversite Vize/Final" },
] as const;

export type ExamTrackId = (typeof EXAM_TRACKS)[number]["id"];

/**
 * Kayıtta seçilen hedef ("YKS hazırlık") → sihirbazın sınav türü (2 Kasım 2026). Kayıtta sorulan sınav kurulumda
 * yeniden sorulmuyordu ama seçili de gelmiyordu; öğrenci aynı soruyu iki kez cevaplıyordu.
 */
export function examTrackForGoal(goal: string | null | undefined): ExamTrackId | null {
  const text = (goal ?? "").toLocaleUpperCase("tr-TR");
  if (/\bLGS\b/.test(text)) return "lgs";
  if (/\bTYT\b/.test(text) && !/\bAYT\b/.test(text)) return "tyt";
  if (/\bAYT\b/.test(text) && !/\bTYT\b/.test(text)) return "ayt";
  if (/\bYKS\b/.test(text)) return "yks";
  if (/\bKPSS\b/.test(text)) return "kpss";
  if (/\bALES\b/.test(text)) return "ales";
  if (/\bTUS\b/.test(text)) return "tus";
  return null;
}

export const DEFAULT_EXAM_LEAD_DAYS = 30;

export const STUDY_BANDS = [
  { id: "ortaokul", label: "5–8. Sınıf", grade: "7. sınıf" },
  { id: "lise", label: "9–12. Sınıf / Lise", grade: "10. sınıf" },
  { id: "sinav", label: "YKS / KPSS / ALES", grade: "12. sınıf" },
  { id: "universite", label: "Üniversite / TUS", grade: "Mezun" },
] as const;

export const EXAM_OCCASIONS = [
  { id: "okul", label: "Okul Yazılısı" },
  { id: "vize", label: "Vize / Final" },
  { id: "genel", label: "Genel Sınav" },
] as const;

export const DAILY_MINUTE_CHOICES = [25, 45, 60, 90] as const;

export function isExamTrack(value: unknown): value is ExamTrackId {
  return typeof value === "string" && EXAM_TRACKS.some((track) => track.id === value);
}

/**
 * Adım sırası. 31 Ekim 2026 (ürün sahibi: "dosya okunurken öğrenci boş ekrana bakmasın"): dil, çalışma tarzı ve aşinalık
 * konu listesine bağlı değil; materyalden sonra sorulur ve bu sırada konu haritası arkada çıkar. Konular ve odak
 * (konuları listeler) haritadan sonra.
 */
export const WIZARD_STEP_ORDER = [
  "subject",
  "date",
  "target",
  "material",
  "language",
  "modality",
  "familiarity",
  "topics",
  "focus",
  "plan",
] as const;

/** İlk materyal hazır olunca sihirbaz bu kadar saniye sonra kendiliğinden ilerler ("Bekle" ile durur). */
export const AUTO_CONTINUE_SECONDS = 2;

export function autoContinueLine(seconds: number): string {
  return `⚡ İlk sayfaların hazır — ${seconds} sn içinde devam ediyoruz; kalanı arkada okunur.`;
}

export const AUTO_CONTINUE_HOLD = "Bekle, dosya ekleyeceğim";

export const DOCUMENT_ANALYSIS_STAGES = [
  "Ekler okunuyor",
  "Kullanılabilirlik kontrol ediliyor",
  "Konular düzenleniyor",
] as const;

/**
 * "Nasıl çalışmayı seversin?" — Astra'daki gibi birden çok seçilir ve her seçeneğin altında ne
 * olduğu yazar (17 Ekim 2026). Hiçbiri seçilmezse "auto": yolun kendi önerisi.
 */
export const STUDY_MODALITY_CHOICES: { id: Exclude<StudyModality, "auto">; label: string; blurb: string }[] = [
  { id: "reading", label: "Okuyarak", blurb: "Kendi hızında okuyacağın kısa dersler" },
  { id: "listening", label: "Dinleyerek", blurb: "Podcast'ler ve sesli anlatım" },
  { id: "watching", label: "İzleyerek", blurb: "Kısa video dersler" },
  { id: "practice", label: "Pratik yaparak", blurb: "Sorular, testler ve deneme sınavları" },
];

/**
 * "Sınavda sık çıkar" rozeti yalnız konuların azınlığını ayırıyorsa anlamlıdır (30 Ekim 2026 canlı tur: dersin dört
 * konusunun dördünde de vardı, hiçbir şey söylemiyordu). Konuların yarısından çoğunda ise gösterilmez.
 */
export function examHeavyBadgeVisible(flags: readonly boolean[]): boolean {
  const heavy = flags.filter(Boolean).length;
  return heavy > 0 && heavy * 2 <= flags.length;
}

export const WIZARD_COPY = {
  continue: "Devam et",
  /** Hızlı başlatma (31 Ekim 2026): okunan materyal varken kalanı beklemeden ilerlenir. */
  continueEarly: "Hazır olanlarla devam et",
  continueEarlyHint: "Kalan sayfalar arka planda okunup hazırlığına eklenecek; beklemene gerek yok.",
  waitingUploads: "Kalan fotoğraflar yükleniyor…",
  languageTitle: "Dil",
  analyzing: "Dosyaların inceleniyor...",
  shapingTitle: "Konular hazırlanıyor...",
  shapingLead: "Materyalin kapsamı konu listesine ayrılıyor.",
  editTopic: "Konuyu değiştir",
  addTopic: "Konu ekle",
  save: "Kaydet",
  cancel: "İptal",
  modalityTitle: "Nasıl çalışmayı seversin?",
  modalityLead: "Planını bunlara göre hazırlarım. Birden çok seçebilirsin.",
  // Aşinalık kurulumda bir kez (18 Ekim 2026): dersler bu düzeyle önceden yazılır.
  familiarityTitle: "Bu derse ne kadar aşinasın?",
  familiarityLead: "Dersler bu düzeyden başlar. Bir dersi açarken değiştirebilirsin.",
  focusTitle: "En çok neye odaklanalım?",
  focusLead: "Hepsini çalışacağız; seçtiklerine biraz daha fazla zaman ayıracağız.",
  equalFocus: "Tüm konulara eşit odaklan",
  planningTitle: "Çalışma planın hazırlanıyor...",
  planningLead: "Konular günlere yerleştiriliyor.",
  planReady: "Çalışma planın hazır!",
  planLead:
    "Yanlış olanı değiştir, eksik olanı ekle, istemediğini kaldır. Yol bu listeyle kurulur.",
  createCta: "Sınav hazırlığı oluştur",
  creating: "Kuruluyor…",
  addMore: "Daha fazla ekle",
  uploadFromPhone: "Telefonundan yükle",
  // Genişlik (29 Ekim 2026): dosyası olmayan öğrenci de materyal ekler.
  pasteText: "📝 Metin / konu listesi yapıştır",
  pasteLead: "Ders notunu, özetini ya da konu listeni buraya yapıştır; bir belge gibi işlenir.",
  pasteName: "Ad (isteğe bağlı)",
  pasteSubmit: "Belge olarak ekle",
  pasteTooShort: "En az birkaç cümle gerekir (80 karakter).",
  addUrl: "🔗 Web / ders bağlantısı (URL) ekle",
  urlLead: "Herkese açık bir ders sayfası, makale ya da PDF bağlantısı. Sayfanın metni belge olarak eklenir.",
  urlSubmit: "Bağlantıyı ekle",
  urlWorking: "Sayfa okunuyor…",
  pickCurriculum: "📚 Dosyam Yok — Resmî MEB / ÖSYM Müfredatından Seç",
  officialLead: "Sınıfını ve dersini seç. Konular resmî programdan anında gelir; yapay zekâ konu uydurmaz.",
  officialYksPart: "Hangi oturum?",
  officialPartScope: (part: string, range: readonly [number, number]) =>
    `${part} kapsamı: ${range[0]}–${range[1]}. sınıf kazanımları (resmî belge kazanımları TYT/AYT diye ayırmaz; sınıf düzeyine göre filtrelendi)`,
  officialPartEmpty: (part: string) =>
    `Bu derste ${part} kapsamında kazanım yok (resmî programda bu sınıf düzeylerine ait kazanım bulunmuyor). Başka bir oturum seçin.`,
  officialWhichExam: "🎯 Hangi Yazılıya Hazırlanıyorsun?",
  officialScenario: "📋 Öğretmeninin Seçtiği MEB Senaryosu",
  officialScenarioHint: "Okulun hangi senaryoyu seçtiğini öğretmenine sorabilirsin. Bilmiyorsan Karma seç.",
  officialKarma: "Bilmiyorum — Karma",
  officialNational: "Bu yazılı ülke geneli ortak sınav. Soru dağılımı sınav öncesi kılavuzla yayımlanacak; şimdilik dönemin bütün kazanımları listelenir.",
  officialSubmit: "Bu konularla devam et",
  officialLoading: "Resmî program yükleniyor…",
  officialFailed: "Resmî program şu an açılamadı. Tekrar dene.",
  officialMissing: "Aradığın ders listede yok mu? Sohbetle kur",
  officialSource: "Kaynak",
  curriculumLead: "Düzeyini ve dersini seç; konu listesi kurulumda çıkarılır, sen onaylarsın.",
  curriculumSubject: "Ders",
  curriculumFree: "Dersin adı (ör. Mikroekonomi)",
  curriculumSubmit: "Bu müfredatla başla",
  phoneLead: "QR’ı telefonunla tara ya da bağlantıyı aç. Dosya bu hazırlığa eklenir.",
  phoneCopy: "Bağlantıyı kopyala",
  phonePreparing: "QR hazırlanıyor…",
  phoneFailed: "QR şu an oluşturulamadı. Dosyayı buradan seçebilirsin.",
  phoneExpired: "Kodun süresi doldu. Kapatıp yeniden aç.",
  phoneClose: "Kapat",
  removeTopic: "Konuyu kaldır",
  moveUp: "Yukarı taşı",
  moveDown: "Aşağı taşı",
  topicDuplicate: "Bu konu listede zaten var.",
  topicCheckFailed: "Konu şu an doğrulanamadı. Tekrar dene.",
  examHeavy: "Sınavda sık çıkar",
  important: "Önemli",
  missingMaterial: "materyalde yok",
  addMissing: "Ekle",
  useSyllabusDate: "Müfredattaki tarihi kullan",
} as const;

export function sourceCountLabel(count: number): string {
  return count === 1 ? "1 kaynak" : `${count} kaynak`;
}

/**
 * Konu satırındaki "N kaynak": yalnız birden çok dosyadan beslenen konuda (19 Ekim 2026, Astra'nın
 * konu listesi gibi). Tek dosyalı konuda yazılmaz — 7 Ekim'de kaldırılan "Kaynak: … s.3, 4" satırı
 * gibi her satırı doldurmasın. Dosya adları üzerine gelince.
 */
export function topicSourcesChip(files: readonly string[] | undefined): { label: string; title: string } | null {
  const unique = [...new Set((files ?? []).map((file) => file.trim()).filter(Boolean))];
  return unique.length >= 2 ? { label: sourceCountLabel(unique.length), title: unique.join(" · ") } : null;
}

const foldTitle = (text: string) =>
  text
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * Tek konulu ünitenin adı konunun adıyla aynıysa başlık tekrar gibi okunuyor ("SİSTEMLER ARASI
 * HOMEOSTAZİ BAĞLANTILARI" altında "Sistemler Arası Homeostazi Bağlantıları"); başlık yazılmaz.
 */
export function redundantUnitHeader(unitTitle: string, topicTitles: string[]): boolean {
  return topicTitles.length === 1 && foldTitle(unitTitle) === foldTitle(topicTitles[0] ?? "");
}

/**
 * Kurulumun konu listesi yolun sırasıyla (24 Ekim 2026 lansman testi): üniteye bağlı olmayan konu "Diğer"
 * başlığıyla en sona düşüyordu; beş dosyalı hazırlıkta yolun ilk konusu (Homeostazi) listenin sonunda göründü.
 * Ünite ilk konusunun yerinde, ünitesiz konu kendi yerinde ve başlıksız.
 */
export function listSegments(
  units: readonly { title: string; topicIndexes: number[] }[],
  orphanIndexes: readonly number[],
): ({ kind: "unit"; unit: { title: string; topicIndexes: number[] } } | { kind: "topic"; index: number })[] {
  const segments = [
    ...units.map((unit) => ({ at: Math.min(...unit.topicIndexes), segment: { kind: "unit" as const, unit } })),
    ...orphanIndexes.map((index) => ({ at: index, segment: { kind: "topic" as const, index } })),
  ];
  return segments.sort((a, b) => a.at - b.at).map((entry) => entry.segment);
}

/** Yükleme sırasında hangi dosyanın okunduğu. */
export function fileProgressLine(
  done: number,
  total: number,
  current: string | null,
): string {
  const ready = `${done}/${total} dosya hazır`;
  return current ? `${ready} · ${current} okunuyor` : ready;
}

/** Aynı anda okunan dosyalar: ikiden fazlası adıyla sayılmaz ("6 dosya okunuyor"). */
export function readingNow(names: readonly string[]): string | null {
  if (!names.length) return null;
  return names.length > 2 ? `${names.length} dosya` : names.join(", ");
}

/**
 * Fotoğraf setinin sayacı (31 Ekim 2026): seçilen fotoğraflar küçültülüp tek belgede birleşir; okunan sayfa ayrıca
 * sayılır. "📸 Fotoğraflar sıkıştırılıyor ve yükleniyor: 42 / 100 • Sayfalar okunuyor: 10 / 100".
 */
export function photoSetProgressLine(progress: { encoded: number; total: number; pagesRead: number; reading: boolean }): string {
  const head = progress.encoded < progress.total
    ? `📸 Fotoğraflar sıkıştırılıyor ve yükleniyor: ${progress.encoded} / ${progress.total}`
    : `📸 ${progress.total} fotoğraf tek belgede`;
  return progress.reading || progress.pagesRead > 0
    ? `${head} • Sayfalar okunuyor: ${Math.min(progress.pagesRead, progress.total)} / ${progress.total}`
    : head;
}

/** Büyük belgenin baş kopyası (31 Ekim 2026, document-head.ts): ilk sayfalar hazır, kalanı arkada okunuyor. */
export function headMaterialLine(ready: number, total: number): string {
  return total > ready
    ? `İlk ${ready} / ${total} sayfa hazır · kalanı arkada okunuyor, hazırlığına eklenecek`
    : `${ready} sayfa`;
}

/** Telefon panelinde gelen dosya sayısı (31 Ekim 2026: kod artık çok dosya alır). */
export function phoneReceivedLine(count: number): string {
  return `Telefondan ${count} dosya geldi. Göndermeye devam edebilirsin; bitince bu pencereyi kapat.`;
}

/** Toplu yüklemede yüklenemeyen dosyalar için tek bildirim (dosya başına ayrı uyarı yok). */
export function batchUploadFailedLine(names: readonly string[]): string {
  const shown = names.slice(0, 3).join(", ");
  const more = names.length > 3 ? ` ve ${names.length - 3} dosya daha` : "";
  return `${names.length} dosya yüklenemedi: ${shown}${more}. Bu dosyaları yeniden seçebilirsin; öbürleri eklendi.`;
}

export const PREP_HOME_COPY = {
  /** Pencereli işleme (31 Ekim 2026): büyük belge pencere pencere eklenir; ilerleme şeritte. */
  windowedHandoff: "Büyük belge bölüm bölüm yoluna ekleniyor; ilerlemeyi üstteki şeritte görebilirsin.",
  path: "Çalışma yolu",
  topics: "Konular",
  materials: "Kaynaklar",
  progress: "İlerleme",
  skillTree: "Beceri ağacı",
  allQuestions: "Tüm sorular",
  continue: "Devam et",
  startLearning: "Hadi öğrenmeye başlayalım",
  noPractice: "Henüz alıştırma yapılmadı.",
  practicedElsewhere: "Çözdüğün sorular çalışma yolundaki düğümlerde.",
  createLesson: "Ders oluştur",
  masterySuffix: "% hakimiyet",
  emptyTree: "Konular kurulunca beceri ağacı burada görünür.",
  skillPractice: "Bu konudaki alıştırmalar çalışma yolundaki düğümlerde.",
  materialsEmpty: "Bu hazırlığa bağlı belge yok. Belge eklersen dersler ona dayanır.",
  noTopics: "Konular kurulunca liste burada görünür.",
  addFile: "Dosya ekle",
  challenge: "Zor sorular",
  challengeLead: "Kaynaklarından daha zor uygulama soruları. İlerleme ve hazırlık puanı durur.",
} as const;
