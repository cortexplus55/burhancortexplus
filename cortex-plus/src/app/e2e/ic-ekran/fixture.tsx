"use client";

import { ParitySorShell } from "@/components/parity/sor-shell";
import { PrepRadarChart } from "@/components/parity/prep-radar-chart";
import { QuizStudio } from "@/components/learning/studio/quiz-studio";
import { MistakeNotebookView } from "@/components/parity/mistake-notebook-view";
import { QuestionSolver, SolutionView } from "@/components/learning/question-solver";
import { SOLVER_ACCENT, SolverHero } from "@/components/learning/solver-hero";
import { PodcastStudio } from "@/components/learning/studio/podcast-studio";
import { ParityExamPrep, type ExamPrepCard } from "@/components/parity/exam-prep";
import { ExamPrepHome, type HomeNode } from "@/components/parity/exam-prep-home";
import { fixtureAccount } from "../ana-ekran/fixture";

const KINDS: [HomeNode["kind"], string][] = [
  ["lesson", "Konu anlatımı"],
  ["quiz", "Konu testi"],
  ["flashcards", "Kartlarla tekrar"],
  ["true_false", "Doğru / Yanlış"],
  ["podcast", "Podcast"],
  ["oral", "Sözlü"],
  ["lesson", "İkinci ders"],
  ["quiz", "İkinci test"],
  ["written_exam", "Yazılı deneme"],
];
const PATH_NODES: HomeNode[] = KINDS.map(([kind, title], index) => ({
  id: `n${index}`,
  kind,
  title,
  dayIndex: 1 + Math.floor(index / 3),
  sortOrder: index,
  status: index < 2 ? "done" : index === 2 ? "ready" : "locked",
}));

/**
 * Konulu yol (B2 anı, 13 Kasım 2026): gerçek hazırlıktaki gibi ders ve test aynı konu bölümünde; ders bitti, test
 * sıradaki.
 */
const TOPIC_PATH_NODES: HomeNode[] = PATH_NODES.map((node, index) => ({
  ...node,
  status: index < 1 ? "done" : index === 1 ? "ready" : "locked",
  sessionMeta: { ...node.sessionMeta, topicTitle: index < 4 ? "Birinci konu" : "İkinci konu" },
}));

const PREP_CARDS: ExamPrepCard[] = [
  {
    id: "p1",
    title: "Biyoloji: Hücre bölünmeleri",
    examType: "YKS",
    progressPct: 34,
    daysLabel: "12 gün kaldı",
    topicsDone: 2,
    topicsTotal: 6,
    targetScore: 80,
    dated: true,
    continueHref: "/deneme-sinavlari/p1",
    next: { kind: "podcast", kindLabel: "Podcast Dinle", heading: "Mayoz bölünmenin evreleri ve genetik çeşitlilik", minutes: 6, href: "/deneme-sinavlari/p1/dugum/n4" },
  },
  {
    id: "p2",
    title: "Matematik: Fonksiyonlar",
    examType: "Okul",
    progressPct: 0,
    daysLabel: "Yola başla",
    topicsDone: 0,
    topicsTotal: 4,
    targetScore: null,
    continueHref: "/deneme-sinavlari/p2",
    next: { kind: "lesson", kindLabel: "Giriş Dersi", heading: "Fonksiyon kavramı", minutes: 5, href: "/deneme-sinavlari/p2/dugum/n0" },
  },
];

/** Yalnız test fikstürü (E2E_FIXTURE=1). */
export function IcEkranFixture({ screen }: { screen: string }) {
  return (
    <ParitySorShell
      userInitial="Ö"
      streak={2}
      account={fixtureAccount(false)}
      {...(screen === "yol" || screen === "yol-konu" ? { chrome: "focus" as const, minimalTop: true } : {})}
      {...(screen === "alt-podcast" ? { chrome: "focus" as const, backHref: "/e2e/ic-ekran?ekran=yol" } : {})}
    >
      {screen === "yol" || screen === "yol-konu" ? (
        <ExamPrepHome
          prepId="fixture-prep"
          title="Fikstür hazırlığı"
          examType="Okul"
          examDate={null}
          daysLabel=""
          progressPct={20}
          nodes={screen === "yol-konu" ? TOPIC_PATH_NODES : PATH_NODES}
          hasTopic
          needsIntro={false}
          startHref="/deneme-sinavlari"
          topicCount={3}
          topicsDone={1}
          topicLabels={["Birinci konu", "İkinci konu", "Üçüncü konu"]}
          materials={[]}
        />
      ) : screen === "cozum" ? (
        <main style={{ padding: "1.5rem 1rem", maxWidth: "44rem", margin: "0 auto" }}>
          <SolutionView
            initialTutorStyle="direct_solve"
            phase={{
              kind: "done",
              status: "verified",
              ms: 4200,
              verifying: false,
              agreed: true,
              solution: {
                readable: true,
                subject: "Fizik",
                question: "Seri bağlı 2 Ω ve 4 Ω dirençlerin uçlarına 12 V uygulanıyor. Devreden geçen akım kaç amperdir?",
                options: [
                  { letter: "A", text: "1" },
                  { letter: "B", text: "2" },
                  { letter: "C", text: "3" },
                ],
                kind: "mcq",
                intro: "Önce eşdeğer direnci bulalım.",
                given: ["R1 = 2 Ω", "R2 = 4 Ω", "V = 12 V"],
                asked: "Akım",
                steps: [
                  { title: "Eşdeğer direnç", math: "R = 2 + 4 = 6 Ω", say: "Seride dirençler toplanır." },
                  { title: "Ohm yasası", math: "I = V / R = 12 / 6 = 2 A", say: "Akım gerilimin dirence bölümüdür." },
                ],
                answer: { letter: "B", value: "2 A", text: "Devreden 2 amper akım geçer." },
                optionsWhy: [],
                trap: "Seri bağlamada dirençleri paralel gibi ters toplarsan 1,33 Ω bulur, yanlış akıma gidersin.",
                tip: "Seri bağlamada eşdeğer direnç dirençlerin toplamıdır: R = R1 + R2.",
                check: "Kontrol: 2 A × 6 Ω = 12 V.",
              },
            } as never}
          />
        </main>
      ) : screen === "soru" ? (
        <div className="cp-page">
          <div className="cp-solver-page" style={{ ["--solver-accent" as string]: SOLVER_ACCENT }}>
            <SolverHero freeAccount={false} />
            <QuestionSolver tutorStyle="direct_solve" />
          </div>
        </div>
      ) : screen === "sinavlar" ? (
        <ParityExamPrep cards={PREP_CARDS} userId={null} />
      ) : screen === "podcast" || screen === "alt-podcast" ? (
        <PodcastStudio creditCost={12} />
      ) : screen === "test" ? (
        <QuizStudio creditCost={10} documents={[]} initialDocumentId={null} />
      ) : screen === "defter" ? (
        <main style={{ padding: "1.5rem 1rem", maxWidth: "48rem", margin: "0 auto" }}>
          <MistakeNotebookView groups={[]} masteredCount={0} />
        </main>
      ) : (
        <main style={{ padding: "1.5rem 1rem", maxWidth: "36rem", margin: "0 auto" }}>
          <PrepRadarChart
            view={{
              label: "Fikstür hazırlığı",
              readinessPct: 0,
              targetScore: 95,
              axes: [
                { id: "coverage", label: "Ölçülen Konular", pct: 0 },
                { id: "accuracy", label: "Test Doğruluğu", pct: 0 },
                { id: "mock", label: "Deneme Performansı", pct: 0 },
                { id: "retention", label: "Tekrar & Kalıcılık", pct: 0 },
                { id: "tempo", label: "Tempo & Düzen", pct: 0 },
              ],
            }}
          />
        </main>
      )}
    </ParitySorShell>
  );
}
