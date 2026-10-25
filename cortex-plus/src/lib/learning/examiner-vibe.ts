/**
 * Sözlü deneme hoca karakteri (examinerVibe).
 *
 * Üç atmosfer: destekleyici, resmi jüri, sıkıştıran koç. Eski öğretmen havası
 * (helpful / strict / harsh) aynı üç karaktere düşer; yeni uçlar `supportive`
 * varsayar — mevcut çağrılar ve testler kırılmasın.
 */

export const EXAMINER_VIBES = ["supportive", "strict_jury", "challenger"] as const;
export type ExaminerVibe = (typeof EXAMINER_VIBES)[number];

export const DEFAULT_EXAMINER_VIBE: ExaminerVibe = "supportive";

/** Eski sözlü kabuk kimlikleri. */
export type LegacyOralMoodId = "helpful" | "strict" | "harsh";

const LEGACY_TO_VIBE: Record<LegacyOralMoodId, ExaminerVibe> = {
  helpful: "supportive",
  strict: "strict_jury",
  harsh: "challenger",
};

export const VIBE_TO_MOOD: Record<ExaminerVibe, LegacyOralMoodId> = {
  supportive: "helpful",
  strict_jury: "strict",
  challenger: "harsh",
};

export const EXAMINER_VIBE_OPTIONS: {
  id: ExaminerVibe;
  emoji: string;
  title: string;
  blurb: string;
}[] = [
  {
    id: "supportive",
    emoji: "💬",
    title: "Destekleyici Hoca",
    blurb: "Takıldığında küçük ipuçlarıyla yönlendirir, yapıcı ve motive edici puanlar.",
  },
  {
    id: "strict_jury",
    emoji: "🏛️",
    title: "Resmi Sınav Jürisi",
    blurb: "İpucu vermez; resmi sınav komisyonu ciddiyetindedir, doğru terim ve tam tanım arar.",
  },
  {
    id: "challenger",
    emoji: "🔥",
    title: "Sıkıştıran Koç",
    blurb: "“Emin misin? Ya soruda şu öncül değişseydi?” diye ezberi yoklar, zayıf noktayı yakalar.",
  },
];

export function parseExaminerVibe(value: unknown): ExaminerVibe {
  if (value === "supportive" || value === "strict_jury" || value === "challenger") return value;
  if (value === "helpful" || value === "strict" || value === "harsh") return LEGACY_TO_VIBE[value];
  return DEFAULT_EXAMINER_VIBE;
}

export function vibeGivesHints(vibe: ExaminerVibe): boolean {
  return vibe === "supportive";
}

/** Soru yazımına eklenen tek blok. */
export function examinerVibeStyleLine(vibe: ExaminerVibe): string {
  switch (vibe) {
    case "strict_jury":
      return (
        "HOCA KARAKTERİ — resmi sınav jürisi: ipucu verme, cevabı söyleme, kısa ve resmi kal. " +
        "Doğru terminoloji ve tam tanım ara; yarım tanımı kabul etme."
      );
    case "challenger":
      return (
        "HOCA KARAKTERİ — sıkıştıran koç: ezberi yokla, zayıf noktayı yakala. " +
        "Soru kökünde 'Emin misin?' ya da 'Ya şu öncül değişseydi?' tarzı bir sıkıştırma olabilir. " +
        "Aşağılama veya hakaret etme. İpucu verme."
      );
    default:
      return (
        "HOCA KARAKTERİ — destekleyici hoca: takıldığında kısa ipucu ver, cevabı doğrudan söyleme. " +
        "Yapıcı ve motive edici kal."
      );
  }
}

/** Puanlama geri bildiriminin tonu. Rubrik değişmez; cümle değişir. */
export function examinerVibeGradeLine(vibe: ExaminerVibe): string {
  switch (vibe) {
    case "strict_jury":
      return (
        "Geri bildirimi resmi sınav komisyonu ciddiyetinde yaz: tam tanım ve doğru terim ara. " +
        "Eksik terimi net söyle. İpucu, cesaretlendirme ya da samimi hitap yok."
      );
    case "challenger":
      return (
        "Geri bildirimi sıkıştıran koç gibi yaz: zayıf noktayı net söyle, " +
        "'Emin misin?' tarzı keskin ama saygılı bir soru bırak. Hakaret etme."
      );
    default:
      return (
        "Geri bildirimi destekleyici hoca gibi yaz: doğru kısmı önce söyle, " +
        "eksiği küçük bir ipucuyla göster, motive edici ve yapıcı kal."
      );
  }
}
