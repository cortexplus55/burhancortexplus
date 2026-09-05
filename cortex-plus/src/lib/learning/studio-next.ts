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
    { id: "flash", href: "/studio/flashcard", label: "Flash kartlar" },
    { id: "podcast", href: "/studio/podcast", label: "Podcast" },
  ],
  tf: [
    { id: "quiz", href: "/studio/quiz", label: "Quiz" },
    { id: "yazili", href: "/studio/yazili", label: "Yazılı" },
  ],
  flash: [
    { id: "quiz", href: "/studio/quiz", label: "Quiz" },
    { id: "sozlu", href: "/studio/sozlu", label: "Sözlü" },
  ],
  podcast: [
    { id: "flash", href: "/studio/flashcard", label: "Flash kartlar" },
    { id: "sozlu", href: "/studio/sozlu", label: "Sözlü" },
  ],
  sozlu: [
    { id: "yazili", href: "/studio/yazili", label: "Yazılı" },
    { id: "quiz", href: "/studio/quiz", label: "Quiz" },
  ],
  yazili: [
    { id: "sozlu", href: "/studio/sozlu", label: "Sözlü" },
    { id: "flash", href: "/studio/flashcard", label: "Flash kartlar" },
  ],
  // Anlatmanın ardından sıradaki adım ölçmek: anlattığını gerçekten
  // biliyor muydun, quiz söyler. Flash kart ise anlatırken tökezlediğin
  // kavramlar için.
  anlat: [
    { id: "quiz", href: "/studio/quiz", label: "Quiz" },
    { id: "flash", href: "/studio/flashcard", label: "Flash kartlar" },
  ],
};

export function studioHref(href: string, topic: string) {
  const clean = topic.trim();
  if (clean.length < 3) return href;
  return `${href}?topic=${encodeURIComponent(clean)}`;
}
