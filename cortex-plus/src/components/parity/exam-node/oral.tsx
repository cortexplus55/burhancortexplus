"use client";

/** Sözlü deneme: konu seçimi, öğretmen ve uzunluk, cevap masası, sonuç ve cevap incelemesi. */
import { OralAnswerDesk } from "@/components/parity/oral-answer-desk";
import { OralAnswerReview, OralPreflightDialog, OralResults, OralReviewTimeDialog, OralTeacherCustomize, OralTopicPick } from "@/components/parity/oral-exam-flow";
import { EMPTY_ORAL_ANSWER_NOTE, oralTeacherById } from "@/lib/learning/oral-exam-chrome";
import { parseExaminerVibe, vibeGivesHints } from "@/lib/learning/examiner-vibe";
import { ORAL_ALL_TOPICS, minutesForOralLength, oralFirstAnswerKey, oralFollowQuestionKey, type OralProbeKind } from "@/lib/learning/oral-exam";
import { NodeGenerationProgress } from "@/components/parity/node-generation-progress";
import type { NodeLifecycle } from "./use-node-lifecycle";

export function OralSetup({ life }: { life: NodeLifecycle }) {
  const { prepId, router, topicLabel, isOral, stage, setStage, setMood, setDifficulty, setVoiceMode, oralSelected, setOralSelected, oralMoodId, setOralMoodId, oralLength, setOralLength, oralPreflight, setOralPreflight, loading, generationError, start, oralRows } = life;
  return (
    <>
      {isOral && stage === "oral-topics" ? (
        <OralTopicPick
          topics={oralRows}
          selected={oralSelected}
          onToggle={(id) =>
            setOralSelected((current) => {
              if (id === ORAL_ALL_TOPICS) {
                return current.includes(ORAL_ALL_TOPICS) ? [] : [ORAL_ALL_TOPICS];
              }
              const rest = current.filter((item) => item !== ORAL_ALL_TOPICS);
              return rest.includes(id) ? rest.filter((item) => item !== id) : [...rest, id];
            })
          }
          onContinue={() => setStage("oral-customize")}
          onClose={() => router.push(`/deneme-sinavlari/${prepId}`)}
        />
      ) : null}

      {isOral && stage === "oral-customize" && loading ? (
        <NodeGenerationProgress
          title="Sözlü deneme sınavı oluşturuluyor"
          topic={topicLabel}
          onClose={() => router.push(`/deneme-sinavlari/${prepId}`)}
        />
      ) : null}

      {isOral && stage === "oral-customize" && !loading ? (
        <>
          <OralTeacherCustomize
            moodId={oralMoodId}
            onMood={setOralMoodId}
            length={oralLength}
            onLength={setOralLength}
            onBack={() => setStage("oral-topics")}
            onClose={() => router.push(`/deneme-sinavlari/${prepId}`)}
            onStart={() => setOralPreflight(true)}
            notice={generationError}
          />
          {oralPreflight ? (
            <OralPreflightDialog
              questionCount={oralLength}
              minutes={minutesForOralLength(oralLength)}
              onCancel={() => setOralPreflight(false)}
              onConfirm={() => {
                const choice = oralTeacherById(oralMoodId);
                setOralPreflight(false);
                setMood(choice.mood);
                setDifficulty(choice.difficulty);
                setVoiceMode(false);
                void start({
                  difficulty: choice.difficulty,
                  voiceMode: false,
                  mood: choice.mood,
                });
              }}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

export function OralPlay({ life }: { life: NodeLifecycle }) {
  const { stage, oralMoodId, loading, payload, index, setIndex, answers, answersRef, finish, updateAnswer, questions } = life;
  return (
    <>
      {stage === "play" && payload.type === "oral" && questions[index] ? (
        <OralAnswerDesk
          index={index}
          total={questions.length}
          prompt={questions[index].prompt ?? ""}
          probeKind={(questions[index].probeKind as OralProbeKind | undefined) ?? "detail"}
          hint={vibeGivesHints(parseExaminerVibe(oralMoodId)) ? questions[index].hint : null}
          persona={oralMoodId}
          minutes={minutesForOralLength(questions.length)}
          value={String(answers[String(index)] ?? "")}
          busy={loading}
          onChange={(text) => updateAnswer(String(index), text, { typing: true })}
          onProbe={(question) => updateAnswer(oralFollowQuestionKey(index), question)}
          onAdvance={(answer, firstAnswer) => {
            if (firstAnswer) updateAnswer(oralFirstAnswerKey(index), firstAnswer);
            updateAnswer(String(index), answer);
            setIndex(index + 1);
          }}
          onFinish={(answer, firstAnswer) => {
            const next: Record<string, unknown> = { ...answersRef.current, [String(index)]: answer };
            if (firstAnswer) next[oralFirstAnswerKey(index)] = firstAnswer;
            if (firstAnswer) updateAnswer(oralFirstAnswerKey(index), firstAnswer);
            updateAnswer(String(index), answer);
            void finish(next);
          }}
        />
      ) : null}
    </>
  );
}

export function OralResultScreens({ life }: { life: NodeLifecycle }) {
  const { isOral, stage, setStage, setOralSelected, oralReport, setOralReport, setOralTranscript, oralReviewIndex, setOralReviewIndex, oralReviewTab, setOralReviewTab, setPayload, setIndex, setAnswers, setScore, spentMinutes, nextHref, setFeedback, answersRef, questions, oralTopicLabel, oralReviewItems, oralFraction, oralPct } = life;
  return (
    <>
      {stage === "oral-review-time" ? (
        <OralReviewTimeDialog onSeeResults={() => setStage("result")} />
      ) : null}

      {stage === "result" && isOral ? (
        <OralResults
          topicLabel={oralTopicLabel}
          pct={oralFraction?.pct ?? oralPct}
          scoreFraction={oralFraction?.label ?? null}
          fullCount={oralReport?.fullCount}
          total={oralReport?.total ?? questions.length}
          minutesSpent={spentMinutes()}
          onReview={() => {
            setOralReviewIndex(0);
            setOralReviewTab("ai");
            setStage("oral-review");
          }}
          strengths={oralReport?.strengths ?? []}
          weaknesses={oralReport?.weaknesses ?? []}
          practiceHref={oralReport?.nextStep?.href}
          practiceLabel={oralReport?.nextStep?.label}
          onRepeat={() => {
            setOralTranscript([]);
            setOralReport(null);
            setOralSelected([]);
            setIndex(0);
            setAnswers({});
            answersRef.current = {};
            setPayload({});
            setScore({ score: 0, total: 1, retried: 0 });
            setFeedback(null);
            setStage("oral-topics");
          }}
          nextHref={nextHref}
        />
      ) : null}

      {stage === "oral-review" ? (
        <OralAnswerReview
          items={
            oralReviewItems.length
              ? oralReviewItems
              : [
                  {
                    question: "Sözlü deneme sorusu sesli iletildi.",
                    answer: "",
                    solution: `Sesli yanıt kaydedilmedi. ${EMPTY_ORAL_ANSWER_NOTE}`,
                  },
                ]
          }
          index={oralReviewIndex}
          tab={oralReviewTab}
          onTab={setOralReviewTab}
          onIndex={setOralReviewIndex}
          onClose={() => setStage("result")}
        />
      ) : null}
    </>
  );
}
