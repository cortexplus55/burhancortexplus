"use client";

import { useState } from "react";
import { DateStep } from "@/components/parity/exam-create-wizard";
import { DifficultyPicker, type DifficultyLevel } from "@/components/parity/difficulty-picker";
import { ExamNodeCoach, type CoachMessage } from "@/components/parity/exam-node-coach";

/** Ağ isteği yok: eğitmen kutusu hazır mesajlarla çizilir. İçerik yer tutucu, konuya özgü değil. */
export function KurulumFixture() {
  const [date, setDate] = useState("");
  const [minutes, setMinutes] = useState(45);
  const [time, setTime] = useState("");
  const [place, setPlace] = useState("");
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("orta");
  const [question, setQuestion] = useState(0);
  const [messages, setMessages] = useState<CoachMessage[]>([
    { role: "user", content: "Bilmiyorum, sen anlat.", q: 0 },
    {
      role: "assistant",
      content:
        "Bu soru **birinci kavramı** yokluyor.\n\n- Önce tanımı hatırla: kavram, bir şeyin neden öyle olduğunu anlatır.\n- Farklı bir örnek: bir kural iki durumda aynı sonucu verir.\n- Bu sorudaki ipucu kökteki anahtar ifade.\n\nSence kökteki hangi ifade bu kavrama işaret ediyor?",
      q: 0,
    },
  ]);
  return (
    <main className="apw" style={{ paddingInline: "1rem" }}>
      <section data-testid="fixture-difficulty" className="cp-exam-setup-card">
        <DifficultyPicker value={difficulty} onChange={setDifficulty} />
      </section>
      <section data-testid="fixture-coach">
        <button type="button" onClick={() => setQuestion((q) => (q ? 0 : 1))}>
          Soruyu değiştir
        </button>
        <ExamNodeCoach
          prepId="11111111-1111-4111-8111-111111111111"
          nodeId="22222222-2222-4222-8222-222222222222"
          itemText="Örnek soru"
          returnPath="/"
          messages={messages}
          onMessagesChange={setMessages}
          questionIndex={question}
        />
      </section>
      <DateStep
        value={date}
        onPick={setDate}
        onNext={() => undefined}
        askLevel={false}
        studyBand={null}
        onStudyBand={() => undefined}
        examOccasion="okul"
        onExamOccasion={() => undefined}
        dailyMinutes={minutes}
        onDailyMinutes={setMinutes}
        examTime={time}
        onExamTime={setTime}
        examPlace={place}
        onExamPlace={setPlace}
        examTrack={null}
      />
    </main>
  );
}
