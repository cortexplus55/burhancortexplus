import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EXAM_WIZARD_DRAFT_ENDPOINT,
  EXAM_WIZARD_DRAFT_KEY,
  clearExamWizardDraft,
  draftStarted,
  dropExamWizardDraft,
  fetchExamWizardDraft,
  normalizeDraftStep,
  parseExamWizardDraft,
  pickNewerDraft,
  pushExamWizardDraft,
  readExamWizardDraft,
  startedDraft,
  writeExamWizardDraft,
  type ExamWizardDraft,
} from "@/lib/learning/exam-wizard-draft";

function sampleDraft(overrides: Partial<ExamWizardDraft> = {}): ExamWizardDraft {
  return {
    v: 1,
    step: "material",
    subject: "Matematik",
    examDate: "2026-10-26",
    target: 80,
    language: "tr",
    modality: "auto",
    equalFocus: true,
    focusTopics: [],
    materials: [{ id: "doc-1", fileName: "notlar.pdf", sizeBytes: 1000, pageCount: 10 }],
    failedMaterials: [],
    processing: null,
    title: "Matematik sınav hazırlığı",
    orderEdited: false,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("exam-wizard-draft", () => {
  afterEach(() => {
    clearExamWizardDraft();
    vi.unstubAllGlobals();
  });

  it("maps building/shaping to language", () => {
    expect(normalizeDraftStep("building")).toBe("language");
    expect(normalizeDraftStep("shaping")).toBe("language");
    expect(normalizeDraftStep("topics")).toBe("topics");
  });

  it("round-trips draft through localStorage", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });

    writeExamWizardDraft(sampleDraft({ step: "building", subject: "Fizik" }));
    const raw = store.get(EXAM_WIZARD_DRAFT_KEY);
    expect(raw).toBeTruthy();
    const read = readExamWizardDraft();
    expect(read?.subject).toBe("Fizik");
    expect(read?.step).toBe("language");
    expect(read?.materials[0]?.id).toBe("doc-1");

    clearExamWizardDraft();
    expect(readExamWizardDraft()).toBeNull();
  });

  it("expires after TTL", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });
    writeExamWizardDraft(
      sampleDraft({
        updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      }),
    );
    // Force stale updatedAt into storage
    const parsed = JSON.parse(store.get(EXAM_WIZARD_DRAFT_KEY)!);
    parsed.updatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    store.set(EXAM_WIZARD_DRAFT_KEY, JSON.stringify(parsed));
    expect(readExamWizardDraft()).toBeNull();
  });

  // 18 Ekim 2026: aynı süzgeç sunucuda da çalışır; cihazlar arası yeni olan kazanır.
  it("saf ayrıştırıcı sunucu satırını da süzer; boş taslak başlamamış sayılır", () => {
    const now = Date.now();
    expect(parseExamWizardDraft(null, now)).toBeNull();
    expect(parseExamWizardDraft({ v: 1 }, now)).toBeNull();
    expect(
      parseExamWizardDraft({ ...sampleDraft(), updatedAt: new Date(now - 25 * 3600 * 1000).toISOString() }, now),
    ).toBeNull();
    const parsed = parseExamWizardDraft({ ...sampleDraft({ step: "shaping" }), materials: [{ id: 7 }] }, now);
    expect(parsed?.step).toBe("language");
    expect(parsed?.materials).toEqual([]);
    expect(draftStarted(parsed!)).toBe(true);
    expect(draftStarted(sampleDraft({ subject: " ", materials: [], title: "" }))).toBe(false);
  });

  // Canlı deneme (18 Ekim 2026): telefon sihirbazı açılınca boş bir tarayıcı kopyası yazıyor; o kopya
  // "var" sayılınca masaüstünde başlanan kurulum telefonda hiç görünmedi.
  it("başlamamış tarayıcı kopyası yok sayılır; dolu sunucu kopyasını yenemez", () => {
    const empty = sampleDraft({ subject: "", materials: [], title: "" });
    expect(startedDraft(empty)).toBeNull();
    expect(startedDraft(null)).toBeNull();
    const remote = sampleDraft({ subject: "Pediatri", updatedAt: new Date(Date.now() - 60_000).toISOString() });
    expect(pickNewerDraft(startedDraft(empty), remote)).toBe(remote);
    expect(pickNewerDraft(empty, remote)).toBe(empty);
  });

  it("iki kopyadan yenisi seçilir", () => {
    const old = sampleDraft({ subject: "Eski", updatedAt: new Date(Date.now() - 60_000).toISOString() });
    const fresh = sampleDraft({ subject: "Yeni" });
    expect(pickNewerDraft(old, fresh)?.subject).toBe("Yeni");
    expect(pickNewerDraft(fresh, old)?.subject).toBe("Yeni");
    expect(pickNewerDraft(null, fresh)?.subject).toBe("Yeni");
    expect(pickNewerDraft(old, null)?.subject).toBe("Eski");
  });

  it("sunucu kopyası: okuma süzülür, yazma PUT, silme iki yeri de boşaltır; ağ hatası sessiz", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchOk = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ draft: sampleDraft({ subject: "Kimya", step: "building" }) }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const remote = await fetchExamWizardDraft(fetchOk);
    expect(remote?.subject).toBe("Kimya");
    expect(remote?.step).toBe("language");
    expect(calls[0].url).toBe(EXAM_WIZARD_DRAFT_ENDPOINT);

    expect(await pushExamWizardDraft(sampleDraft({ step: "building" }), fetchOk)).toBe(true);
    expect(calls[1].init?.method).toBe("PUT");
    expect((JSON.parse(String(calls[1].init?.body)) as { draft: { step: string } }).draft.step).toBe("language");

    const store = new Map<string, string>([[EXAM_WIZARD_DRAFT_KEY, "{}"]]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
    await dropExamWizardDraft(fetchOk);
    expect(store.has(EXAM_WIZARD_DRAFT_KEY)).toBe(false);
    expect(calls[2].init?.method).toBe("DELETE");

    const fetchDown = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await fetchExamWizardDraft(fetchDown)).toBeNull();
    expect(await pushExamWizardDraft(sampleDraft(), fetchDown)).toBe(false);
    await expect(dropExamWizardDraft(fetchDown)).resolves.toBeUndefined();
  });
});
