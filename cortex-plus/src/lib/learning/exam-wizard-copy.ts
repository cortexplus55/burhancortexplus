import type { StudyModality } from "@/lib/learning/exam-prep-ui-path";

/**
 * PDF sonrası sihirbaz ve hazırlık evi kopyası.
 * Bileşenler bu sabitleri kullanır; metin ikinci bir yerde yazılmaz.
 */
export const WIZARD_STEP_ORDER = [
  "start",
  "subject",
  "date",
  "target",
  "material",
  "language",
  "topics",
  "modality",
  "focus",
  "plan",
] as const;

export type WizardProgressStep = (typeof WIZARD_STEP_ORDER)[number];

export const DOCUMENT_ANALYSIS_STAGES = [
  "Ekler okunuyor",
  "Kullanılabilirlik kontrol ediliyor",
  "Konular düzenleniyor",
] as const;

export const STUDY_MODALITY_CHOICES: { id: StudyModality; label: string }[] = [
  { id: "reading", label: "Okuyarak" },
  { id: "listening", label: "Dinleyerek" },
  { id: "watching", label: "İzleyerek" },
  { id: "practice", label: "Pratik yaparak" },
  { id: "auto", label: "Sen karar ver" },
];

export const WIZARD_COPY = {
  continue: "Devam et",
  languageTitle: "Dil",
  analyzing: "Dosyaların inceleniyor...",
  shapingTitle: "Konular hazırlanıyor...",
  shapingLead: "Materyalin kapsamı konu listesine ayrılıyor.",
  editTopic: "Konuyu değiştir",
  addTopic: "Konu ekle",
  save: "Kaydet",
  cancel: "İptal",
  modalityTitle: "Nasıl çalışmayı seversin?",
  focusTitle: "En çok neye odaklanalım?",
  equalFocus: "Tüm konulara eşit odaklan",
  planReady: "Çalışma planın hazır!",
  createCta: "Sınav hazırlığı oluştur",
  creating: "Kuruluyor…",
} as const;

export const PREP_HOME_COPY = {
  path: "Çalışma yolu",
  progress: "İlerleme",
  skillTree: "Beceri ağacı",
  allQuestions: "Tüm sorular",
  continue: "Devam et",
  noPractice: "Henüz alıştırma yapılmadı.",
  practicedElsewhere: "Çözdüğün sorular çalışma yolundaki düğümlerde.",
  createLesson: "Ders oluştur",
  masterySuffix: "% hakimiyet",
  emptyTree: "Konular kurulunca beceri ağacı burada görünür.",
  skillPractice: "Bu konudaki alıştırmalar çalışma yolundaki düğümlerde.",
} as const;
