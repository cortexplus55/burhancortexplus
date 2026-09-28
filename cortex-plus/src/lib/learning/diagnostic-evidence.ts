/**
 * A page count is not an evidence count. Some workbooks repeat one short
 * statement across many numbered pages; a three-skill diagnosis would force
 * the generator to invent material absent from the document.
 */
export function hasRepetitiveSparseEvidence(pageTexts: string[]): boolean {
  if (pageTexts.length < 3) return false;
  const normalized = pageTexts.map((text) =>
    text
      .normalize("NFKC")
      .toLocaleLowerCase("tr")
      .replace(/\d+(?:[.,]\d+)*/g, "#")
      .replace(/\s+/g, " ")
      .trim(),
  );
  return normalized[0].length < 500 && normalized.every((text) => text === normalized[0]);
}
