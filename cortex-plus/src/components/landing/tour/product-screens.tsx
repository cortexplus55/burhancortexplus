"use client";

import { useCallback, useMemo, useState } from "react";
import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";
import { ExamQuizPlay } from "@/components/parity/exam-quiz-play";
import { CARD_RECALL_HINT, CardProgress, FlashCard } from "@/components/parity/exam-node/cards";
import { CardGradeButtons } from "@/components/parity/review-grade-buttons";
import { RichBody } from "@/components/parity/lesson-rich-text";
import { TrueFalseFocusCard } from "@/components/learning/true-false-focus-card";
import { TwoOptionHint } from "@/components/learning/two-option-hint";
import { TOUR_CARDS, TOUR_LESSON, TOUR_QUIZ, TOUR_TRUE_FALSE, tourTwoOptionHint } from "@/lib/demo/guest-tour";
import { sameOptionSet, selectedOptions } from "@/lib/learning/exam-quiz";
import { gradeLessonSectionCheck, type CheckGradeVariant, type LessonCheckAnswer } from "@/lib/learning/lesson-play";
import { sealLessonV3ForPlay } from "@/lib/learning/lesson-play-v3";
import { v3ToV2 } from "@/lib/learning/lesson-v3";
import { trueFalseExplanation } from "@/lib/learning/true-false-quality";
import "@/styles/parity-shell.css";
import "@/styles/tour-product.css";

/**
 * Tanıtım turunun ürün ekranları (11 Kasım 2026). Ürün sahibi: "Sistemde nasıl bir ekranla karşılaşacaklar, onu
 * göstermemiz lazım."
 *
 * Bu dosya ekran ÇİZMEZ; ürünün kendi bileşenlerini örnek veriyle (`guest-tour.ts`) çalıştırır:
 *
 *   ders          → `ExamLessonSteps` (mühürlü ders + ürünle aynı notlandırma işlevi, tarayıcıda)
 *   soru          → `ExamQuizPlay` + `TwoOptionHint` (ipucu sunucudan değil, örnek veriden)
 *   kartlar       → `FlashCard` + `CardGradeButtons` (yol oturumundaki kartın kendisi)
 *   doğru/yanlış  → `TrueFalseFocusCard`
 *
 * Fark yalnız durumun nerede durduğudur: üründe yaşam döngüsü kancası sunucuyla konuşur, burada küçük yerel durum.
 * Hiç ağ isteği atılmaz. Dosya ana sayfanın ilk yükünde yoktur: tur ilk kez gerektiğinde ayrı parça olarak yüklenir
 * (uygulamanın stil dosyası büyük; ziyaretçi turu açmadan indirmez).
 *
 * Çerçeve (`tp-frame`) uygulamanın kendi kabuk sınıflarını taşır (`dark cp-sor-root cp-exam-page`): ekranlar
 * üründeki renk ve ölçülerle çizilir. Kabuk sayfa boyu olmaya çalışmasın diye yalnız yerleşim kuralları
 * `tour-product.css`te daraltılır.
 */

export type TourScreen = "lesson" | "question" | "cards" | "check";

export type TourScreenProps = {
  screen: TourScreen;
  /** Ekran bitti: tur sıradaki adıma geçer. */
  onDone: () => void;
  /** Ders ekranındaki × : tur bir önceki adıma döner. */
  onExit: () => void;
  /** Konu testi sorusu kilitlendi: ilk denemede doğru mu? */
  onQuestion: (correct: boolean) => void;
  /** Doğru / yanlış önermeleri bitti: kaçı doğru. */
  onTruth: (right: number, total: number) => void;
};

const FRAME_LABEL: Record<TourScreen, string> = {
  lesson: "Konu anlatımı",
  question: "Konu testi",
  cards: "Kartlarla tekrar",
  check: "Doğru / Yanlış",
};

export function TourProductScreen(props: TourScreenProps) {
  return (
    <div className="tp-frame" data-screen={props.screen}>
      <div className="tp-bar" aria-hidden>
        <span className="tp-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="tp-url">cortexplus.app</span>
        <span className="tp-crumb">{FRAME_LABEL[props.screen]}</span>
      </div>
      <div className="tp-app dark cp-sor-root cp-sor-root--session">
        <div className="cp-exam-page cp-exam-node">
          {props.screen === "lesson" ? <TourLesson onDone={props.onDone} onExit={props.onExit} /> : null}
          {props.screen === "question" ? <TourQuiz onDone={props.onDone} onQuestion={props.onQuestion} /> : null}
          {props.screen === "cards" ? <TourCards onDone={props.onDone} /> : null}
          {props.screen === "check" ? <TourTrueFalse onDone={props.onDone} onTruth={props.onTruth} /> : null}
        </div>
      </div>
    </div>
  );
}

/** Ders: ürünün ders ekranı. Paket mühürlü gider (cevap tarayıcıya açık yazılmaz), not üründeki işlevle verilir. */
function TourLesson({ onDone, onExit }: Pick<TourScreenProps, "onDone" | "onExit">) {
  const sealed = useMemo(() => sealLessonV3ForPlay(TOUR_LESSON), []);
  const stored = useMemo(() => v3ToV2(TOUR_LESSON), []);
  const grade = useCallback(
    async (sectionIndex: number, answer: LessonCheckAnswer, variant?: CheckGradeVariant) => {
      const result = gradeLessonSectionCheck(stored, sectionIndex, answer, variant ?? "primary", "tr");
      if (!result) throw new Error("tour_check_missing");
      return result;
    },
    [stored],
  );
  return <ExamLessonSteps lesson={sealed} gradeCheck={grade} onFinish={() => onDone()} onClose={onExit} plannedMinutes={3} />;
}

/** Konu testi: ürünün soru ekranı; "İki şık arasında kaldım" aynı bileşen, ipucu örnek veriden. */
function TourQuiz({ onDone, onQuestion }: Pick<TourScreenProps, "onDone" | "onQuestion">) {
  const [value, setValue] = useState<string | string[] | undefined>(undefined);
  const [locked, setLocked] = useState(false);
  const [usedHint, setUsedHint] = useState(false);
  return (
    <div className="cp-written-review">
      <ExamQuizPlay
        questions={TOUR_QUIZ}
        index={0}
        value={value}
        onChange={setValue}
        onReveal={() => {
          setLocked(true);
          onQuestion(sameOptionSet(selectedOptions(value), TOUR_QUIZ[0]!.correct ?? []));
        }}
        locked={locked}
        usedHint={usedHint}
        onContinue={onDone}
        continueLabel="Akıllı kartlara geç"
        twoOption={(at) => (
          <TwoOptionHint
            attemptId="tur"
            index={at}
            options={TOUR_QUIZ[at]?.options ?? []}
            resolve={tourTwoOptionHint}
            onUsed={() => setUsedHint(true)}
          />
        )}
      />
    </div>
  );
}

/** Kartlar: önce hatırla, sonra çevir, sonra dürüstçe değerlendir (üründeki sıra). */
function TourCards({ onDone }: Pick<TourScreenProps, "onDone">) {
  const [at, setAt] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const card = TOUR_CARDS[at]!;
  return (
    <section className="cp-exam-card-stage">
      <CardProgress label={null} position={at + 1} total={TOUR_CARDS.length} />
      <FlashCard
        front={card.front}
        back={card.back}
        flipped={flipped}
        onFlip={() => {
          setFlipped((current) => !current);
          setRevealed(true);
        }}
      />
      {revealed ? (
        <>
          <p>Ne kadar hatırladın?</p>
          <CardGradeButtons
            className="cp-exam-card-rate"
            onGrade={() => {
              if (at + 1 < TOUR_CARDS.length) {
                setAt(at + 1);
                setFlipped(false);
                setRevealed(false);
              } else {
                onDone();
              }
            }}
          />
        </>
      ) : (
        <p className="cp-exam-card-hint">{CARD_RECALL_HINT}</p>
      )}
    </section>
  );
}

/** Doğru / Yanlış: ürünün odak kartı. */
function TourTrueFalse({ onDone, onTruth }: Pick<TourScreenProps, "onDone" | "onTruth">) {
  const [at, setAt] = useState(0);
  const [picks, setPicks] = useState<boolean[]>([]);
  const item = TOUR_TRUE_FALSE[at]!;
  const picked = typeof picks[at] === "boolean" ? picks[at]! : null;
  const revealed = picked !== null;
  let streakBefore = 0;
  for (let back = at - 1; back >= 0; back -= 1) {
    if (picks[back] !== TOUR_TRUE_FALSE[back]!.correct) break;
    streakBefore += 1;
  }
  return (
    <section>
      <TrueFalseFocusCard
        index={at}
        total={TOUR_TRUE_FALSE.length}
        statement={<RichBody text={item.text} />}
        picked={picked}
        correct={item.correct}
        revealed={revealed}
        explanation={<RichBody text={trueFalseExplanation(item)} />}
        nextLabel={at + 1 < TOUR_TRUE_FALSE.length ? "Sonraki önerme" : "Sonucu gör"}
        streakBefore={streakBefore}
        onPick={(answer) => {
          if (revealed) return;
          setPicks((current) => {
            const next = [...current];
            next[at] = answer;
            return next;
          });
        }}
        onNext={() => {
          if (!revealed) return;
          if (at + 1 < TOUR_TRUE_FALSE.length) {
            setAt(at + 1);
            return;
          }
          onTruth(picks.filter((answer, index) => answer === TOUR_TRUE_FALSE[index]!.correct).length, TOUR_TRUE_FALSE.length);
          onDone();
        }}
      />
    </section>
  );
}
