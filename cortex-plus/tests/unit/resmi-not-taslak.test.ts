import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { officialSourceNote, readCurriculumRef } from "@/lib/curriculum/registry";
import {
  EXAM_WIZARD_DRAFT_KEY,
  readExamWizardDraft,
  setExamWizardDraftOwner,
  writeExamWizardDraft,
  type ExamWizardDraft,
} from "@/lib/learning/exam-wizard-draft";
import { TOPIC_ONLY_NOTICE } from "@/lib/learning/prep-source";

function fakeStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      get length() { return store.size; },
      key: (i: number) => [...store.keys()][i] ?? null,
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  return store;
}

const draft = (subject: string): ExamWizardDraft => ({
  v: 1, step: "date", subject, examDate: "", target: 75, language: "tr", modality: "auto",
  equalFocus: true, focusTopics: [], materials: [], failedMaterials: [], processing: null,
  title: "", orderEdited: false, updatedAt: new Date().toISOString(),
});

afterEach(() => vi.unstubAllGlobals());

describe("resmî kaynak notu", () => {
  it("kayıttaki program için yazılı ve senaryoyla not üretir", () => {
    const ref = readCurriculumRef({ curriculum: { programId: "meb-10-matematik", examKey: "d1y1", scenario: 2 } });
    const note = officialSourceNote(ref)!;
    expect(note).toContain("resmî programdaki kazanımlara göre");
    expect(note).toContain("10. Sınıf Matematik");
    expect(note).toContain("maarif_2024");
    expect(note).toContain("1. Dönem 1. Yazılı · Senaryo 2");
    expect(note).not.toBe(TOPIC_ONLY_NOTICE);
  });
  it("bilinmeyen program ya da başvurusuz hazırlıkta null (eski not kalır)", () => {
    expect(officialSourceNote(readCurriculumRef({}))).toBeNull();
    expect(officialSourceNote(readCurriculumRef(null))).toBeNull();
    expect(officialSourceNote(readCurriculumRef({ curriculum: { programId: "yok", examKey: "d1y1" } }))).toBeNull();
  });
});

describe("taslak hesaba bağlı", () => {
  it("yeni hesap önceki hesabın taslağını görmez ve eskiler silinir", () => {
    const store = fakeStorage();
    store.set(EXAM_WIZARD_DRAFT_KEY, JSON.stringify(draft("Eski sahipsiz")));
    setExamWizardDraftOwner("user-a");
    expect(store.has(EXAM_WIZARD_DRAFT_KEY)).toBe(false);
    writeExamWizardDraft(draft("Fizik"));
    expect(readExamWizardDraft()?.subject).toBe("Fizik");
    setExamWizardDraftOwner("user-b");
    expect(readExamWizardDraft()).toBeNull();
    expect(store.has(`${EXAM_WIZARD_DRAFT_KEY}:user-a`)).toBe(false);
  });
  it("sahip bilinmiyorsa tarayıcı kopyası kullanılmaz", () => {
    fakeStorage();
    setExamWizardDraftOwner(null);
    writeExamWizardDraft(draft("Kimya"));
    expect(readExamWizardDraft()).toBeNull();
  });
});
