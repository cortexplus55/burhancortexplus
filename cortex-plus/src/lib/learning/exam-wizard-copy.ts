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
  planningTitle: "Çalışma planın hazırlanıyor...",
  planningLead: "Konular günlere yerleştiriliyor.",
  planReady: "Çalışma planın hazır!",
  planLead:
    "Yanlış olanı değiştir, eksik olanı ekle, istemediğini kaldır. Yol bu listeyle kurulur.",
  createCta: "Sınav hazırlığı oluştur",
  creating: "Kuruluyor…",
  addMore: "Daha fazla ekle",
  uploadFromPhone: "Telefonundan yükle",
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
  fileCap: "Bir hazırlığa en fazla 8 dosya ekleyebilirsin.",
} as const;

export const PREP_HOME_COPY = {
  path: "Çalışma yolu",
  topics: "Konular",
  materials: "Materyaller",
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
} as const;
