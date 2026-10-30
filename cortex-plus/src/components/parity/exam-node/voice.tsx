"use client";

/** Sesli mod (soru-cevap, sözlü): sesli eğitmen. */
import { ExamVoiceTutor } from "@/components/parity/exam-voice-tutor";
import type { NodeLifecycle } from "./use-node-lifecycle";

export function VoicePlay({ life }: { life: NodeLifecycle }) {
  const { prepId, nodeId, kind, isOral, stage, difficulty, oralMoodId, setOralTranscript, loading, payload, finish, oralVoiceLabel } = life;
  return (
    <>
      {stage === "play" && payload.type === "voice" ? (
        <ExamVoiceTutor
          prepId={prepId}
          nodeId={nodeId}
          kind={kind === "oral" ? "oral" : "qa"}
          topicLabel={oralVoiceLabel}
          difficulty={difficulty}
          returnPath={`/deneme-sinavlari/${prepId}`}
          teacherStyle={isOral ? oralMoodId : undefined}
          submitting={loading}
          onFinish={(turns, transcript) => {
            if (transcript) setOralTranscript(transcript);
            void finish({ "0": turns > 0 ? "sesli yanıt" : "" });
          }}
        />
      ) : null}
    </>
  );
}
