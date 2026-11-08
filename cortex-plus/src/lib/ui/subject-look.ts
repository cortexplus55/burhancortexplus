import {
  Atom,
  BookOpen,
  Cpu,
  Brain,
  Dna,
  Feather,
  FlaskConical,
  Globe2,
  GraduationCap,
  Landmark,
  Languages,
  type LucideIcon,
  Scale,
  Sigma,
} from "lucide-react";

/**
 * Dersin simgesi ve rengi (8 Kasım 2026'dan beri tek kaynak): müfredat kartları ve kurulum sihirbazının ders
 * kutuları aynı görünür. Yalnız görünüm; ad üzerinden eşlenir, konu listesi değildir. Renk seçim rengi değildir
 * (seçim mavi kalır), yalnız dersin simgesine ve kimliğine düşer.
 */
const SUBJECT_LOOK: { test: RegExp; icon: LucideIcon; accent: string }[] = [
  { test: /matemat|geometri|sayısal|ales|dgs/i, icon: Sigma, accent: "#5b6cff" },
  { test: /fizik/i, icon: Atom, accent: "#36b6ff" },
  { test: /kimya/i, icon: FlaskConical, accent: "#2fc7b6" },
  { test: /biyoloji|tus|dus|anatomi|fizyoloji|tıp/i, icon: Dna, accent: "#3fc56b" },
  { test: /türkçe|edebiyat|dil ve anlatım/i, icon: Feather, accent: "#ff7a59" },
  { test: /tarih|inkılap|kpss/i, icon: Landmark, accent: "#c46bff" },
  { test: /coğrafya/i, icon: Globe2, accent: "#2fc7b6" },
  { test: /felsefe|psikoloji|mantık|sosyoloji/i, icon: Brain, accent: "#9b6bff" },
  { test: /ingilizce|yds|almanca|yabancı/i, icon: Languages, accent: "#ff5d8f" },
  { test: /din|vatandaşlık|hukuk/i, icon: Scale, accent: "#ff9478" },
  { test: /bilgisayar|yazılım|programlama|algoritma|veri yapı/i, icon: Cpu, accent: "#36b6ff" },
  { test: /tyt|ayt|yks|lgs|fen|sosyal/i, icon: BookOpen, accent: "#7b88ff" },
];

export const DEFAULT_SUBJECT_LOOK = { icon: GraduationCap, accent: "#7b88ff" } as const;

export function subjectLook(text: string): { icon: LucideIcon; accent: string } {
  // Türkçe küçük harf: "İngilizce" düz /i ile eşleşmiyordu (İ → i̇).
  const lower = text.toLocaleLowerCase("tr");
  const hit = SUBJECT_LOOK.find((look) => look.test.test(lower));
  return hit ?? DEFAULT_SUBJECT_LOOK;
}
