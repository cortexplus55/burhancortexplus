export type SignupRole = "student" | "parent" | "teacher";

export type ParentLinkMode = "code" | "email" | "later";

export type ParentRelation = "anne" | "baba" | "vasi" | "diger";

export type SignupPayload = {
  role: SignupRole;
  fullName: string;
  gradeLevel?: string;
  schoolName?: string;
  focusSubject?: string;
  learningGoal?: string;
  avatarEmoji?: string;
  parentRelation?: ParentRelation;
  parentPhone?: string;
  parentLinkMode?: ParentLinkMode;
  parentInviteCode?: string;
  parentInviteEmail?: string;
  teacherInstitution?: string;
  teacherBranch?: string;
  teacherClassName?: string;
};

export const SIGNUP_STORAGE_KEY = "cortex-signup-payload";

export const ROLE_OPTIONS: {
  id: SignupRole;
  title: string;
  body: string;
  emoji: string;
}[] = [
  {
    id: "student",
    title: "Öğrenciyim",
    body: "AI öğretmenle çalış, deneme çöz, eksiklerini gör.",
    emoji: "🎓",
  },
  {
    id: "parent",
    title: "Veliyim",
    body: "Çocuğunun ilerlemesini ücretsiz gör, Plus'ı sen al.",
    emoji: "👨‍👩‍👧",
  },
  {
    id: "teacher",
    title: "Okul öğretmeniyim",
    body: "Sınıflarını yönet, ödev ve quiz paylaş.",
    emoji: "🏫",
  },
];

export const GRADE_OPTIONS = [
  "5. sınıf",
  "6. sınıf",
  "7. sınıf",
  "8. sınıf",
  "9. sınıf",
  "10. sınıf",
  "11. sınıf",
  "12. sınıf",
  "Mezun",
];

export const SUBJECT_OPTIONS = [
  { label: "Matematik", emoji: "📐" },
  { label: "Fizik", emoji: "⚡" },
  { label: "Kimya", emoji: "⚗️" },
  { label: "Biyoloji", emoji: "🧬" },
  { label: "Türkçe", emoji: "📚" },
  { label: "İngilizce", emoji: "🇬🇧" },
  { label: "Tarih", emoji: "📜" },
  { label: "Coğrafya", emoji: "🌍" },
];

export const GOAL_OPTIONS = [
  { label: "YKS hazırlık", body: "TYT / AYT odaklı çalışma" },
  { label: "LGS hazırlık", body: "Liseye geçiş sınavı" },
  { label: "Okul sınavları", body: "Yazılılar ve sözlüler" },
  { label: "Konu pekiştirme", body: "Eksiklerimi kapatmak" },
];

export const AVATAR_OPTIONS = [
  "🦊",
  "🐼",
  "🦉",
  "🐙",
  "🦁",
  "🐧",
  "🚀",
  "⭐",
  "🌙",
  "🔥",
  "🎯",
  "🧠",
];

/** Sunucu yokken yedek liste; tercihen `/api/schools/search` kullanılır. */
export const SCHOOL_SUGGESTIONS = [
  "Atatürk Anadolu Lisesi",
  "Cumhuriyet Anadolu Lisesi",
  "Fen Lisesi",
  "Gazi Anadolu Lisesi",
  "İstiklal Ortaokulu",
  "Mehmet Akif Ersoy Lisesi",
  "Mimar Sinan Anadolu Lisesi",
  "Şehit Öğretmen Ortaokulu",
  "TED Koleji",
  "Ted Rönesans Koleji",
  "Vefa Lisesi",
  "Yunus Emre Ortaokulu",
];

export function searchSchools(query: string): string[] {
  const q = query.trim().toLocaleLowerCase("tr");
  if (!q) return SCHOOL_SUGGESTIONS.slice(0, 6);
  return SCHOOL_SUGGESTIONS.filter((s) =>
    s.toLocaleLowerCase("tr").includes(q),
  ).slice(0, 6);
}

export function homePathForRole(role: string | null | undefined): string {
  switch (role) {
    case "parent":
      return "/veli";
    case "teacher":
    case "verified_teacher":
      return "/ogretmen-paneli";
    case "admin":
      return "/admin";
    default:
      return "/ogretmen";
  }
}

export const PARENT_RELATION_OPTIONS: {
  id: ParentRelation;
  title: string;
  body: string;
}[] = [
  { id: "anne", title: "Anne", body: "Çocuğumun annesiyim" },
  { id: "baba", title: "Baba", body: "Çocuğumun babasıyım" },
  { id: "vasi", title: "Vasi", body: "Yasal vasi veya velayet sahibiyim" },
  { id: "diger", title: "Diğer", body: "Aile üyesi veya bakmakla yükümlüyüm" },
];

export const PARENT_INTRO_POINTS = [
  "Onaylı çocuğunun deneme, quiz ve çalışma özeti — ücretsiz",
  "Sohbetler ve mesajlar yalnızca çocuğuna özel kalır",
  "Plus’ı sen satın alırsın; kota çocuğunun hesabına gider",
  "Veli AI: çocuğuna nasıl destek olacağını sor",
];

/** Boş bırakılabilir; doldurulursa 10–15 haneli numara beklenir. */
export function isOptionalPhoneValid(value: string | undefined): boolean {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return true;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

export function stepIdsForRole(role: SignupRole): string[] {
  if (role === "parent") {
    return [
      "role",
      "parent-intro",
      "parent-relation",
      "parent-phone",
      "parent-link",
      "account",
    ];
  }
  if (role === "teacher")
    return ["role", "teacher-school", "teacher-class", "account"];
  return ["role", "grade", "subject", "goal", "avatar", "account"];
}
