export type TeacherToolCategory =
  | "all"
  | "planning"
  | "materials"
  | "assessment"
  | "support"
  | "admin";

export type TeacherAiTool = {
  id: string;
  title: string;
  description: string;
  category: Exclude<TeacherToolCategory, "all">;
  prompt: string;
};

export const TEACHER_TOOL_CATEGORIES: {
  id: TeacherToolCategory;
  label: string;
}[] = [
  { id: "all", label: "Tümü" },
  { id: "planning", label: "Planlama" },
  { id: "materials", label: "Materyaller" },
  { id: "assessment", label: "Değerlendirme" },
  { id: "support", label: "Öğrenci desteği" },
  { id: "admin", label: "İdari" },
];

export const TEACHER_AI_TOOLS: TeacherAiTool[] = [
  {
    id: "lesson-plan",
    title: "Ders planı hazırlayın",
    description:
      "Tek ders saati için giriş, öğretim, uygulama ve çıkış bileti — süreye göre.",
    category: "planning",
    prompt:
      "8. sınıf matematik için 40 dakikalık bir ders planı hazırla: giriş, öğretim, uygulama, çıkış bileti.",
  },
  {
    id: "worksheet",
    title: "Çalışma kağıdı oluşturun",
    description: "Artan zorlukta sorular ve tek sayfalık cevap anahtarı.",
    category: "materials",
    prompt:
      "Üslü sayılar konusunda 10 soruluk çalışma kağıdı ve cevap anahtarı hazırla.",
  },
  {
    id: "quiz",
    title: "Quiz yazın",
    description: "Karışık soru türleri, cevap anahtarı ve kısa açıklamalar.",
    category: "assessment",
    prompt:
      "Fotosentez konusunda 8 soruluk çoktan seçmeli quiz ve cevap anahtarı yaz.",
  },
  {
    id: "rubric",
    title: "Değerlendirme ölçeği",
    description: "4 seviyeli analitik rubrik, gözlemlenebilir kriterlerle.",
    category: "assessment",
    prompt:
      "Proje ödevi için 4 seviyeli analitik değerlendirme ölçeği oluştur.",
  },
  {
    id: "misconceptions",
    title: "Yanlış anlamalar",
    description: "Sık hatalar ve her biri için öğretim hamlesi.",
    category: "support",
    prompt:
      "Kesirler konusunda öğrencilerin sık yaptığı yanlış anlamaları listele ve her biri için düzeltme stratejisi öner.",
  },
  {
    id: "parent-email",
    title: "Veli e-postası",
    description: "Olumlu güncelleme veya endişe — tonunu sen seç, taslak hazır.",
    category: "admin",
    prompt:
      "Veliye yönelik kısa, olumlu bir e-posta taslağı yaz: öğrencinin sınıftaki katılımı hakkında.",
  },
  {
    id: "differentiation",
    title: "Farklılaştırma",
    description: "Aynı hedef, farklı seviyeler için giriş noktaları.",
    category: "planning",
    prompt:
      "Aynı ders hedefi için ileri seviye, destek ihtiyacı olan ve İngilizce öğrenen öğrenciler için farklılaştırma öner.",
  },
  {
    id: "discussion",
    title: "Tartışma soruları",
    description: "Isınma → ana → sentez; öğretmen notlarıyla.",
    category: "materials",
    prompt:
      "İklim değişikliği ünitesi için 3 aşamalı tartışma soruları hazırla.",
  },
  {
    id: "interactive-app",
    title: "Interaktif uygulama",
    description: "Sınıfta kullanılacak mini simülasyon veya oyun fikri.",
    category: "materials",
    prompt:
      "8. sınıf için 5 dakikalık interaktif bir matematik oyunu fikri ve kuralları yaz.",
  },
];
