import { describe, expect, it } from "vitest";
import { layoutBoard, studentTextParts } from "@/lib/learning/lesson-board";

// Astra ile yan yana (18 Ekim 2026): Astra'nın dersinde satır başındaki sayılar liste numarası
// sanılıp kayboldu — "2 ay / 6 ay / 9 ay" yerine "1 Ay / 2 Ay / 3 Ay", açıklamada "ayda sosyal
// gülümsemenin olmaması". Bizde tahta metni sayıyı olduğu gibi göstermeli.
describe("lesson board keeps leading numbers", () => {
  it("does not turn ages into list numbers", () => {
    const text = [
      "2. ay: Sosyal gülümseme başlar.",
      "6. ay: Destekli oturur.",
      "9. ay: Desteksiz oturur, yabancı kaygısı belirginleşir.",
      "18. ayda hiç anlamlı kelime olmaması alarm bulgusudur.",
    ].join("\n");
    const shown = layoutBoard(text)
      .flatMap((line) => studentTextParts(line.text).map((part) => part.text))
      .join(" | ");
    for (const age of ["2. ay", "6. ay", "9. ay", "18. ayda"]) expect(shown).toContain(age);
  });
});

describe("lesson board keeps capitalised ordinals", () => {
  it("keeps 2. Ay / 6. Ay when the numbers do not count from 1", () => {
    const shown = layoutBoard(
      ["2. Ay: Sosyal gülümseme başlar.", "6. Ay: Destekli oturur.", "9. Ay: Yabancı kaygısı belirginleşir."].join("\n"),
    )
      .map((line) => line.text)
      .join(" | ");
    for (const age of ["2. Ay", "6. Ay", "9. Ay"]) expect(shown).toContain(age);
  });

  it("still drops the numbers of a real 1, 2, 3 formula list", () => {
    const shown = layoutBoard(["1. P = F/A", "2. W = F · d"].join("\n")).map((line) => line.text);
    expect(shown.some((line) => /^\d\.\s/.test(line))).toBe(false);
  });
});

describe("chat markdown keeps Turkish ordinals", () => {
  it("does not renumber '2. ay / 6. ay' as a list", async () => {
    const { renderMarkdownToHtml } = await import("@/lib/markdown");
    const html = renderMarkdownToHtml("Gelişim basamakları:\n\n2. ay: sosyal gülümseme\n6. ay: destekli oturma\n9. ay: yabancı kaygısı");
    for (const age of ["2. ay", "6. ay", "9. ay"]) expect(html).toContain(age);
    expect(html).not.toContain("<ol");
  });

  it("still renders a real numbered list", async () => {
    const { renderMarkdownToHtml } = await import("@/lib/markdown");
    const html = renderMarkdownToHtml("1. Kilo akut durumu yansıtır\n2. Boy kronik süreci yansıtır");
    expect(html).toContain("<ol");
    expect(html).toContain("<li>Kilo akut durumu yansıtır</li>");
  });
});

describe("chat markdown keeps a list's own numbers", () => {
  it("starts a split list at its own number", async () => {
    const { renderMarkdownToHtml } = await import("@/lib/markdown");
    expect(renderMarkdownToHtml("3. Üçüncü adım\n4. Dördüncü adım")).toContain('start="3"');
  });
});
