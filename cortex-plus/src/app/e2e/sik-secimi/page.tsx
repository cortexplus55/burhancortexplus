import { notFound } from "next/navigation";
import { publicNodePayload } from "@/lib/learning/node/payload";
import { stripAnswerKeyForActiveExam } from "@/lib/learning/active-exam-seal";
import { studentSafePayload } from "@/lib/learning/student-safe-text";
import { canonicalQuizAnswer, quizCheckFeedback, storedQuizQuestion } from "@/lib/learning/answer-check-core";
import { optionMatchKey, stemMatchKey } from "@/lib/learning/option-match";
import { applyOrder, poolChoiceOrders } from "@/lib/learning/option-balance";
import { SikSecimiFixture, type CheckTable } from "./fixture";

export const dynamic = "force-dynamic";

/**
 * Şık seçimi fikstürü (28 Kasım 2026, P0): gerçek oturum ekranı (`ExamNodeSession`), gerçek sunucu işlevleriyle
 * kurulan mühürlü paket ve `answer-check` cevapları. Veritabanı ve model yok.
 *
 * `?sira=duz`: şıklar yazıldığı sırada, i. sorunun doğrusu i. harf (A–E).
 * `?sira=karisik`: şıklar havuzun dengeleyicisiyle karışır (`poolChoiceOrders`), doğru harfi değişir.
 * `?ters=1`: sunucu cevabındaki şık sırası ters (eski sunucu ya da başka sıra): ekran kendi sırasını korumalı.
 * `?uzun=1`: uzun açıklama (kart ekrana sığmaz, alt çubuk içeriğin üstüne yapışır).
 * `?coklu=1`: ilk soru kayıtta çok cevaplı işaretli ama tek anahtarlı: ekranda tek seçimli kalmalı.
 */
const STEMS = [
  "Tarım topluluklarında mülkiyet anlayışı hangi gelişmeyle güçlenmiştir?",
  "İlk kentlerin kurulmasında en etkili etken hangisidir?",
  "Yazının bulunmasının doğrudan sonucu hangisidir?",
  "Takas ekonomisinin yerini alan uygulama hangisidir?",
  "Göçebe topluluklarda yaygın olan geçim biçimi hangisidir?",
];
const OPTION_SETS = [
  ["Göçebe hayvancılığın artmasıyla", "Avcılığın yasaklanmasıyla", "Ticaret yollarının kapanmasıyla", "Yazının unutulmasıyla", "Yerleşik yaşamın yaygınlaşmasıyla"],
  ["Akarsu kenarlarında tarımın gelişmesi", "Madenlerin tükenmesi", "Göçlerin durması", "Deniz ticaretinin bitmesi", "Avcılığın artması"],
  ["Tarih çağlarının başlaması", "Tarımın sona ermesi", "Kentlerin dağılması", "Göçebeliğin artması", "Madenciliğin durması"],
  ["Paranın kullanılması", "Avcılık", "Toplayıcılık", "Göçebelik", "Mağara yaşamı"],
  ["Hayvancılık", "Bankacılık", "Sanayi", "Madencilik", "Gemicilik"],
];
const CORRECT = OPTION_SETS.map((set, i) => (i === 0 ? set[4]! : set[0]!));

function plainOrder(): string[][] {
  // i. sorunun doğrusu i. harfte: doğru şık i. sıraya taşınır, öbürleri sırasını korur.
  return OPTION_SETS.map((set, i) => {
    const rest = set.filter((option) => option !== CORRECT[i]);
    return [...rest.slice(0, i), CORRECT[i]!, ...rest.slice(i)];
  });
}

const LONG =
  " Tarımla birlikte insanlar toprağa bağlandı; ekilen alan aileye ya da topluluğa ait sayıldı. Sınır, miras ve takas" +
  " kuralları bu yüzden ortaya çıktı. Göçebe toplulukta ise sürü ve otlak dönemlik kullanılıyordu.";

function storedPayload(sira: string, options: { long?: boolean; multiFlag?: boolean } = {}) {
  const plain = plainOrder();
  const sets =
    sira === "karisik"
      ? (() => {
          const rows = plain.map((options, i) => ({ id: `q${i}`, choices: options, answer: options.indexOf(CORRECT[i]!) }));
          const orders = poolChoiceOrders(rows as never, "fixture-salt");
          return rows.map((row, i) => applyOrder(row.choices, orders[i]!));
        })()
      : plain;
  return {
    type: "quiz",
    questions: STEMS.map((text, i) => ({
      text,
      options: sets[i]!,
      correct: [CORRECT[i]!],
      // `coklu=1`: kayıtta çok cevaplı işaretli ama tek anahtarlı ilk soru (kurtarma yolundan gelebilen kayıt).
      multi: options.multiFlag === true && i === 0,
      explanation: `Doğru cevap: ${CORRECT[i]}.${options.long ? LONG.repeat(3) : ""}`,
    })),
  };
}

export default async function SikSecimiPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const params = await searchParams;
  const sira = params.sira === "karisik" ? "karisik" : "duz";
  const stored = storedPayload(sira, { long: params.uzun === "1", multiFlag: params.coklu === "1" });
  const sealed = studentSafePayload(stripAnswerKeyForActiveExam(publicNodePayload(stored, [], "quiz")));
  const table: CheckTable = stored.questions.map((_, index) => {
    const question = storedQuizQuestion(stored, index)!;
    const feedback = quizCheckFeedback(question);
    return {
      stem: stemMatchKey(question.text),
      feedback: params.ters === "1" ? { ...feedback, options: [...feedback.options].reverse() } : feedback,
      canonical: Object.fromEntries(question.options.map((option) => [optionMatchKey(option), canonicalQuizAnswer(question, option)])),
    };
  });
  // Test sorunun doğrusunu ekrandaki metniyle bilir (yalnız fikstür; üründe anahtar istemciye gitmez).
  const keys = table.map((row) => String((row.feedback.correct as string[] | undefined)?.[0] ?? ""));
  return <SikSecimiFixture payload={sealed} table={table} keys={keys} />;
}
