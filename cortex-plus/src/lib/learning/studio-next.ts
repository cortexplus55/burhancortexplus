export type StudioToolId =
  | "quiz"
  | "tf"
  | "flash"
  | "podcast"
  | "sozlu"
  | "yazili"
  | "anlat";

export const STUDIO_NEXT: Record<
  StudioToolId,
  { id: StudioToolId; href: string; label: string }[]
> = {
  quiz: [
    { id: "flash", href: "/studio/flashcard", label: "Kartlar" },
    { id: "podcast", href: "/studio/podcast", label: "Podcast" },
  ],
  tf: [
    { id: "quiz", href: "/studio/quiz", label: "Konu testi" },
    { id: "yazili", href: "/studio/yazili", label: "Yazılı deneme" },
  ],
  flash: [
    { id: "quiz", href: "/studio/quiz", label: "Konu testi" },
    { id: "sozlu", href: "/studio/sozlu", label: "Sözlü deneme" },
  ],
  podcast: [
    { id: "flash", href: "/studio/flashcard", label: "Kartlar" },
    { id: "sozlu", href: "/studio/sozlu", label: "Sözlü deneme" },
  ],
  sozlu: [
    { id: "yazili", href: "/studio/yazili", label: "Yazılı deneme" },
    { id: "quiz", href: "/studio/quiz", label: "Konu testi" },
  ],
  yazili: [
    { id: "sozlu", href: "/studio/sozlu", label: "Sözlü deneme" },
    { id: "flash", href: "/studio/flashcard", label: "Kartlar" },
  ],
  // Anlatmanın ardından sıradaki adım ölçmek: anlattığını gerçekten
  // biliyor muydun, quiz söyler. Flash kart ise anlatırken tökezlediğin
  // kavramlar için.
  anlat: [
    { id: "quiz", href: "/studio/quiz", label: "Konu testi" },
    { id: "flash", href: "/studio/flashcard", label: "Kartlar" },
  ],
};

export function studioHref(href: string, topic: string) {
  const clean = topic.trim();
  if (clean.length < 3) return href;
  return `${href}?topic=${encodeURIComponent(clean)}`;
}
