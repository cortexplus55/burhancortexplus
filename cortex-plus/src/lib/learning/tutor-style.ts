export type TutorStyle = "step_by_step" | "hints_first" | "direct_solve";

export const TUTOR_STYLE_OPTIONS: {
  id: TutorStyle;
  title: string;
  body: string;
  emoji: string;
}[] = [
  {
    id: "step_by_step",
    title: "Adım adım anlat",
    body: "Her adımı gerekçesiyle birlikte, sırayla ilerleriz.",
    emoji: "🪜",
  },
  {
    id: "hints_first",
    title: "Önce ipucu ver",
    body: "Cevabı hemen vermeden düşünmen için ipuçlarıyla yönlendiririm.",
    emoji: "💡",
  },
  {
    id: "direct_solve",
    title: "Doğrudan çöz",
    body: "Net sorularda hızlıca tam çözüme gideriz.",
    emoji: "⚡",
  },
];

export const DEFAULT_TUTOR_STYLE: TutorStyle = "step_by_step";

export function parseTutorStyle(value: unknown): TutorStyle {
  if (
    value === "step_by_step" ||
    value === "hints_first" ||
    value === "direct_solve"
  ) {
    return value;
  }
  return DEFAULT_TUTOR_STYLE;
}

export function tutorStylePrompt(style: TutorStyle): string {
  switch (style) {
    case "hints_first":
      return "Öğrenci ipucu öncelikli stili seçti: önce düşünmesi için ipuçları ver, gerekmedikçe tam çözümü başta verme. İstediğinde adım adım genişlet.";
    case "direct_solve":
      return "Öğrenci doğrudan çözüm stili seçti: net sorularda hızlı ve tam çözüm sun; gereksiz uzatma. Karmaşık konularda kısa bir özetle başla.";
    default:
      return "Öğrenci adım adım stili seçti: anlaşılır, sıralı anlat; her adımı gerekçelendir. Markdown ve LaTeX kullanabilirsin.";
  }
}

export function tutorStyleLabel(style: TutorStyle): string {
  return (
    TUTOR_STYLE_OPTIONS.find((o) => o.id === style)?.title ?? "Adım adım anlat"
  );
}
