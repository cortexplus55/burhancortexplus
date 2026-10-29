/** Ders adımındaki kaynak künyesini öğrencinin belgesine bağlar. Yeni sekme açılmaz. */

/** Şekil sayfasının ekindeki satırlar (sunucu `figure-pages.ts` kurar; ilk 12). */
export type FigureHintRef = { page: number; lines: string[] };

export type SourceDocRef = {
  id: string;
  name: string;
  pages?: string;
  /** Şekil okunmuş sayfalar (29 Ekim 2026): adım bu sayfadaysa şekil derse gömülü gösterilir. */
  figurePages?: number[];
  /** Şekil sayfalarının ipucu satırları: kart, değeri anan ekrana yerleşir (Paket H). */
  figureHints?: FigureHintRef[];
};

export type LessonSourceMatch = { documentId: string; page: number; fileName: string };

/** Adımın kaynak sayfası belgenin şekil sayfalarından biri mi. */
export function isFigurePage(match: LessonSourceMatch | null, docs: readonly SourceDocRef[]): boolean {
  if (!match) return false;
  const doc = docs.find((item) => item.id === match.documentId);
  return Boolean(doc?.figurePages?.includes(match.page) || doc?.figureHints?.some((hint) => hint.page === match.page));
}

/** Eşleşen şekil sayfasının ipucu satırları (kart PDF dışı kaynakta bunları gösterir). */
export function figureHintsFor(match: LessonSourceMatch | null, docs: readonly SourceDocRef[]): string[] {
  if (!match) return [];
  const doc = docs.find((item) => item.id === match.documentId);
  return doc?.figureHints?.find((hint) => hint.page === match.page)?.lines ?? [];
}

function fold(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR");
}

export function firstPageNumber(pages: string | undefined): number | undefined {
  const match = pages?.match(/\d+/);
  if (!match) return undefined;
  const page = Number(match[0]);
  return page > 0 ? page : undefined;
}

/**
 * Adımın sayfası varsa onu kullan. Dosya adı bir belgeye oturursa o belge;
 * tek belge varsa adım dosya adı taşımasa da o. Birden çok belgede tahmin yok.
 */
export function matchLessonSource(
  source: { file: string; page?: number } | undefined,
  docs: SourceDocRef[],
): LessonSourceMatch | null {
  if (!docs.length) return null;
  const pageFromStep = source?.page && source.page > 0 ? source.page : undefined;
  const file = source?.file ? fold(source.file) : "";
  const named = file
    ? docs.find((doc) => fold(doc.name) === file) ??
      docs.find((doc) => {
        const name = fold(doc.name);
        return name.length > 0 && (name.includes(file) || file.includes(name));
      })
    : undefined;
  const doc = named ?? (docs.length === 1 ? docs[0] : undefined);
  if (!doc) return null;
  const page = pageFromStep ?? firstPageNumber(doc.pages);
  if (!page) return null;
  return { documentId: doc.id, page, fileName: doc.name };
}

/* ───────────── Şekil kartının yeri (29 Ekim 2026, Paket H) ───────────── */

/*
  Neden: V3 ekranları `source` taşımıyor; kart adımın sayfasına değil konunun ilk sayfasına
  düşüyordu, çok belgeli derste hiç eşleşmiyordu. Şimdi kart konunun ŞEKİL SAYFALARINA bağlı:
  ekran metninde şekil ekindeki bir değer ya da etiket geçiyorsa kart o ekranda, ders başına
  aynı sayfa bir kez. Hiçbir ekran anmıyorsa açılış ekranı dışındaki ilk boş ekran.
*/

/** Karşılaştırma anahtarı: aksan düşer, ı/İ → i, tire türleri birleşir, boşluk kalkar. */
export function figureKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[ıİ]/g, "i")
    .toLowerCase()
    .replace(/[−–—]/g, "-")
    .replace(/\s+/g, "");
}

const RELATION = /[=→←↔⇒⇐⇔≤≥<>≈≠]/;

/**
 * İpucu satırının ekranda aranacak parçaları: eşitlik/ok ifadesi ve sayı taşıyan yanları,
 * "etiket: değer" çiftinin değeri ve etiketi, birimli sayı, en az altı harflik etiket.
 * Çıplak sayı ("4") parça değildir — her ekranda geçer.
 */
export function hintAtoms(line: string): string[] {
  const atoms = new Set<string>();
  const chunks = line
    .split(/[;|]|,(?!\d)/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  for (const chunk of chunks) {
    const key = figureKey(chunk);
    if (!key) continue;
    if (RELATION.test(key)) {
      if (key.length >= 3) atoms.add(key);
      // Yanlar: sayı taşıyan ifade ("f(-1)", "0,12sn") ya da en az altı harflik etiket ("pdalgasi").
      for (const side of key.split(/[=→←↔⇒⇐⇔≤≥<>≈≠]+/)) {
        if (/\d/.test(side)) {
          if (side.length >= 3 && /[a-z(]/.test(side)) atoms.add(side);
        } else if (side.length >= 6) {
          atoms.add(side);
        }
      }
      continue;
    }
    const colon = chunk.indexOf(":");
    if (colon > 0) {
      const label = figureKey(chunk.slice(0, colon));
      const value = figureKey(chunk.slice(colon + 1));
      if (value.length >= 3 && /\d/.test(value)) atoms.add(value);
      if (label.length >= 6 && !/\d/.test(label)) atoms.add(label);
      continue;
    }
    if (/\d/.test(key)) {
      if (/[a-z]/.test(key) && key.length >= 3) atoms.add(key);
    } else if (key.length >= 6) {
      atoms.add(key);
    }
  }
  return [...atoms];
}

/** Ekran metni ipucu satırlarından birinin değerini ya da etiketini anıyor mu. */
export function hintMatchesText(lines: readonly string[], text: string): boolean {
  const key = figureKey(text);
  if (!key) return false;
  return lines.some((line) => hintAtoms(line).some((atom) => key.includes(atom)));
}

/** Blokların bütün metin yaprakları (formül, tablo hücresi, kart, soru dahil) tek dize. */
export function blocksSearchText(blocks: readonly unknown[] | undefined): string {
  const parts: string[] = [];
  const walk = (value: unknown, depth: number) => {
    if (depth > 8 || value == null) return;
    if (typeof value === "string") {
      if (value.trim()) parts.push(value);
      return;
    }
    if (typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    for (const item of Object.values(value as Record<string, unknown>)) walk(item, depth + 1);
  };
  walk(blocks ?? [], 0);
  return parts.join(" ");
}

export type FigureScreen = {
  source?: { file: string; page?: number };
  blocks?: readonly unknown[];
  /** Ekranın dersin kaçıncı ekranı olduğu; açılış ekranı (0) yedek yer olarak son sırada. */
  sectionIndex: number;
};

type FigureEntry = { documentId: string; fileName: string; page: number; lines: string[] };

function figureEntries(docs: readonly SourceDocRef[]): FigureEntry[] {
  const entries: FigureEntry[] = [];
  for (const doc of docs) {
    const seen = new Set<number>();
    for (const hint of doc.figureHints ?? []) {
      if (seen.has(hint.page)) continue;
      seen.add(hint.page);
      entries.push({ documentId: doc.id, fileName: doc.name, page: hint.page, lines: hint.lines });
    }
    for (const page of doc.figurePages ?? []) {
      if (seen.has(page)) continue;
      seen.add(page);
      entries.push({ documentId: doc.id, fileName: doc.name, page, lines: [] });
    }
  }
  return entries;
}

const entryKey = (entry: { documentId: string; page: number }) => `${entry.documentId}:${entry.page}`;

/**
 * Tek ekran için şekil kaynağı: adımın kendi kaynağı şekil sayfasıysa o; yoksa konunun şekil
 * sayfalarından (herhangi belge) ekran metninde ipucu değerini/etiketini anan ilk sayfa.
 * `used` verilirse o sayfalar atlanır (ders başına bir kez).
 */
export function figureSourceFor(
  step: { source?: { file: string; page?: number } },
  docs: readonly SourceDocRef[],
  screenText: string,
  used: ReadonlySet<string> = new Set(),
): LessonSourceMatch | null {
  if (step.source) {
    const own = matchLessonSource(step.source, docs as SourceDocRef[]);
    return own && isFigurePage(own, docs) && !used.has(entryKey(own)) ? own : null;
  }
  for (const entry of figureEntries(docs)) {
    if (used.has(entryKey(entry)) || !entry.lines.length) continue;
    if (hintMatchesText(entry.lines, screenText)) {
      return { documentId: entry.documentId, page: entry.page, fileName: entry.fileName };
    }
  }
  return null;
}

/**
 * Dersin bütün ekranları için şekil kartı planı: ekran sırası → eşleşme. Önce adımın kendi
 * kaynağı, sonra ipucu eşleşmesi, en son anılmayan şekil sayfası için yedek yer (açılış ekranı
 * dışındaki ilk boş ekran; başka yoksa açılış). Aynı sayfa ders başına bir kez.
 */
export function planFigureSources(
  screens: readonly FigureScreen[],
  docs: readonly SourceDocRef[],
): Map<number, LessonSourceMatch> {
  const plan = new Map<number, LessonSourceMatch>();
  const used = new Set<string>();
  if (!screens.length || !docs.length) return plan;
  const texts = screens.map((screen) => blocksSearchText(screen.blocks));

  // 1) Adımın kendi kaynağı şekil sayfasıysa kart orada.
  screens.forEach((screen, i) => {
    if (!screen.source) return;
    const match = figureSourceFor(screen, docs, texts[i]!, used);
    if (!match) return;
    used.add(entryKey(match));
    plan.set(i, match);
  });

  // 2) Değeri ya da etiketi anan ilk kaynaksız ekran.
  for (const entry of figureEntries(docs)) {
    if (used.has(entryKey(entry)) || !entry.lines.length) continue;
    const i = screens.findIndex(
      (screen, idx) => !screen.source && !plan.has(idx) && hintMatchesText(entry.lines, texts[idx]!),
    );
    if (i < 0) continue;
    const match = { documentId: entry.documentId, page: entry.page, fileName: entry.fileName };
    used.add(entryKey(match));
    plan.set(i, match);
  }

  // 3) Hiçbir ekran anmıyorsa: açılış ekranı dışındaki ilk boş ekran (yoksa açılış).
  const open = () => {
    const free = screens.map((screen, idx) => idx).filter((idx) => !screens[idx]!.source && !plan.has(idx));
    return free.find((idx) => screens[idx]!.sectionIndex > 0) ?? free[0];
  };
  for (const entry of figureEntries(docs)) {
    if (used.has(entryKey(entry))) continue;
    const i = open();
    if (i == null) break;
    const match = { documentId: entry.documentId, page: entry.page, fileName: entry.fileName };
    used.add(entryKey(match));
    plan.set(i, match);
  }
  return plan;
}
