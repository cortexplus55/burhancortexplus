import { describe, expect, it } from "vitest";
import { stripInlineSourceLine } from "@/lib/learning/lesson-source";

describe("stripInlineSourceLine", () => {
  it("extracts a trailing citation and cleans the body", () => {
    const { body, source } = stripInlineSourceLine(
      "Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir. Kaynak: pdf-12-sayfa.pdf, s.3.",
    );
    expect(body).toBe("Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir.");
    expect(source).toEqual({ file: "pdf-12-sayfa.pdf", page: 3 });
  });

  it("extracts a citation embedded mid-body and keeps the trailing sentence readable", () => {
    // The real pipeline can leave a citation in the middle of a section's
    // body when a second pass (weaveUnusedSources) appends more prose after
    // the first citation attachCitations already added.
    const { body, source } = stripInlineSourceLine(
      "44 g/mol ile 2 mol eder. Kaynak: pdf-12-sayfa.pdf, s.4. Mol kütlesi yerine atom kütlesini koymak sonucu şaşırtır.",
    );
    expect(body).toBe("44 g/mol ile 2 mol eder. Mol kütlesi yerine atom kütlesini koymak sonucu şaşırtır.");
    expect(source).toEqual({ file: "pdf-12-sayfa.pdf", page: 4 });
  });

  it("keeps the last citation when a body has more than one", () => {
    const { source } = stripInlineSourceLine(
      "Bir cümle. Kaynak: a.pdf, s.1. Başka bir cümle. Kaynak: b.pdf, s.9.",
    );
    expect(source).toEqual({ file: "b.pdf", page: 9 });
  });

  it("leaves ordinary text without a citation untouched", () => {
    const text = "Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir.";
    expect(stripInlineSourceLine(text)).toEqual({ body: text, source: null });
  });

  it("does not treat the word 'kaynak' inside a sentence as a citation", () => {
    const text = "Bu bilginin kaynak güvenilirliği tartışmalıdır ve derste ele alınmaz.";
    expect(stripInlineSourceLine(text)).toEqual({ body: text, source: null });
  });
});

describe("citation metadata stays out of the lesson body end-to-end", () => {

  it("legacy content saved before this fix (citation baked into body, no source field) still renders without crashing and can still be extracted", () => {
    // Simulates a lesson persisted before this change: no `source` field at
    // all, citation text lives inside `body`. The UI (exam-lesson-steps.tsx)
    // applies the same stripInlineSourceLine at render time as a fallback.
    const legacyBody =
      "Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir. Kaynak: pdf-12-sayfa.pdf, s.3.";
    const { body, source } = stripInlineSourceLine(legacyBody);
    expect(body).toBe("Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir.");
    expect(source).toEqual({ file: "pdf-12-sayfa.pdf", page: 3 });
  });
});
