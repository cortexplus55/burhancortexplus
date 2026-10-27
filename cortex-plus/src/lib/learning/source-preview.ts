/** Ders adımındaki kaynak künyesini öğrencinin belgesine bağlar. Yeni sekme açılmaz. */

export type SourceDocRef = { id: string; name: string; pages?: string };

export type LessonSourceMatch = { documentId: string; page: number; fileName: string };

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
