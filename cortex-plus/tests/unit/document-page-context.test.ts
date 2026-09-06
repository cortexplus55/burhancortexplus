import { expect, it } from "vitest";
import { documentPageContext } from "@/lib/documents/page-context";

it("labels multiple numbered sections with their physical page", () => {
  const text = documentPageContext(["15 Ters Fonksiyonlar\n16 Sinüs Teoremi\n2cos x+1=0"]);
  expect(text).toContain("[Sayfa 1] Sinüs Teoremi (bölüm numarası: 16)");
  expect(text).toContain("[Sayfa 1] Ters Fonksiyonlar");
  expect(text).toContain("2cos x+1=0");
  expect(text).not.toContain("[Sayfa 16]");
});
