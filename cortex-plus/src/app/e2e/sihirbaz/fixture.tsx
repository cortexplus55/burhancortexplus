"use client";

import { ParitySorShell } from "@/components/parity/sor-shell";
import { ExamCreateWizard } from "@/components/parity/exam-create-wizard";
import { examWizardDraftKey, setExamWizardDraftOwner, type ExamWizardDraft } from "@/lib/learning/exam-wizard-draft";
import type { StudentAccountContext } from "@/lib/student/account-context";

const OWNER = "e2e-sihirbaz";
const STEPS = ["subject", "date", "target", "material", "language", "modality", "familiarity", "topics", "focus", "plan"];

/** Yer tutucu konular; içerik bir derse özgü değil. */
const TOPICS = ["Birinci ünite: temel kavramlar", "İkinci ünite: yöntemler", "Üçüncü ünite: uygulamalar", "Dördüncü ünite: tekrar"];

function account(): StudentAccountContext {
  return {
    audience: "plus",
    balance: 7200,
    freeAllowanceRemaining: 0,
    isPremium: true,
    showsUpgradeChrome: false,
    subscriptionBadge: "Plus",
    subscriptionAllowance: 7200,
    subscriptionPeriodEnd: null,
    canSpend: true,
    isAdmin: false,
    resetsAtLabel: "10 Kasım 2026 00:00",
    periodKind: "monthly",
    usedPercent: 10,
    extraPercent: null,
  } as StudentAccountContext;
}

function seed(step: string) {
  setExamWizardDraftOwner(OWNER);
  const key = examWizardDraftKey(OWNER);
  if (!key || typeof window === "undefined") return;
  const index = STEPS.indexOf(step);
  if (index <= 0) {
    window.localStorage.removeItem(key);
    return;
  }
  const exam = new Date(Date.now() + 36 * 86_400_000).toISOString().slice(0, 10);
  const draft: ExamWizardDraft = {
    v: 1,
    step: step as ExamWizardDraft["step"],
    subject: "Biyoloji",
    examDate: index > 1 ? exam : "",
    target: 80,
    language: "tr",
    modality: "auto",
    modalities: [],
    familiarity: index > 6 ? "basics" : undefined,
    equalFocus: true,
    focusTopics: [],
    materials:
      index > 3
        ? [
            { id: "11111111-1111-4111-8111-111111111111", fileName: "Ders notu.pdf", sizeBytes: 2_400_000, pageCount: 24 },
            { id: "22222222-2222-4222-8222-222222222222", fileName: "Çıkmış sorular.pdf", sizeBytes: 900_000, pageCount: 8 },
          ]
        : [],
    failedMaterials: [],
    processing: null,
    topicsDraft: index > 6 ? { topics: TOPICS, topicPages: TOPICS.map((_, i) => [i * 3 + 1, i * 3 + 2]) } : undefined,
    title: "",
    orderEdited: false,
    updatedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(key, JSON.stringify(draft));
}

/** Yalnız test fikstürü (E2E_FIXTURE=1): kurulum sihirbazı, öğrenci kabuğunun içinde. */
export function SihirbazFixture({ step }: { step: string }) {
  if (typeof window !== "undefined") seed(step);
  return (
    <ParitySorShell userInitial="Ö" streak={0} account={account()}>
      <ExamCreateWizard recentSubjects={["Biyoloji", "Kimya"]} onUseChat={() => undefined} gradeLevel="11. sınıf" profileGoal="YKS hazırlık" />
    </ParitySorShell>
  );
}
