/**
 * Konunun 1., 2. ve 3. testi aynı soruları sormasın (25 Ekim 2026, canlı test P1-2) — ders bağımsız.
 *
 * Üç test de konunun bütün sayfalarından aynı istemle yazılıyordu; model en belirgin dört bilgiyi her
 * seferinde yeniden sordu. Kapsam artık testin sırasına göre bölünür: omurga (konunun kendi alt
 * başlıkları, `lessonBackbone`) ikiye ayrılır; ilk test temel ve ilk yarı, ikinci uygulama ve ikinci
 * yarı, üçüncü bütün omurgadan sentez. Omurga yoksa yalnız soru türü değişir. Başka konunun sayfası
 * zaten kaynağa girmez; cümle bunu yazara da söyler.
 */
export function backboneSlice(backbone: readonly string[], variant: number): string[] {
  if (!backbone.length) return [];
  if (variant >= 2 || backbone.length < 2) return [...backbone];
  const half = Math.ceil(backbone.length / 2);
  return variant <= 0 ? backbone.slice(0, half) : backbone.slice(half);
}

const STYLE: readonly string[] = [
  "Temel düzey: tanım, sınıflama, sayısal kural ve eşik soruları.",
  "Uygulama düzeyi: kaynaktaki bilgiyi somut bir duruma, hesaba ya da vakaya uygulatan sorular; tanımı geri sorma.",
  "Sentez düzeyi: iki ya da daha çok alt başlığı birleştiren, karşılaştıran ya da öncüllü (I, II, III) sorular.",
];

export function practiceCoverage(variant: number | null | undefined, backbone: readonly string[]): string {
  const step = Math.max(0, Math.min(2, variant ?? 0));
  const slice = backboneSlice(backbone, step);
  const focus = slice.length
    ? ` Öncelikli alt başlıklar: ${slice.map((item, index) => `${index + 1}) ${item}`).join(" · ")}.`
    : "";
  return `${STYLE[step]}${focus} Yalnız bu konunun KAYNAK sayfalarından sor; başka konunun bilgisini sorma.`;
}

/** Eski düğümlerde varyant metada yok: başlıktan okunur ("İkinci test", "Üçüncü test"). */
export function practiceVariantFromTitle(title: string | null | undefined): number {
  const text = (title ?? "").toLocaleLowerCase("tr");
  if (text.includes("üçüncü test")) return 2;
  if (text.includes("ikinci test")) return 1;
  return 0;
}
