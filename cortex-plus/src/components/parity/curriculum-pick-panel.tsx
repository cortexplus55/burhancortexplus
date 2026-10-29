"use client";

import { useMemo, useState } from "react";
import { CURRICULUM_LEVELS, curriculumPick } from "@/lib/learning/exam-catalog";
import { WIZARD_COPY } from "@/lib/learning/exam-wizard-copy";

/**
 * Hazır müfredattan başlangıç (29 Ekim 2026). Düzey + ders seçilir; kurulum sohbeti dolu istemle
 * açılır ve konu listesini çıkarır. Burada konu listesi yok: seçilen yalnız sınav/düzey ve ders.
 */
export function CurriculumPickPanel({
  gradeLevel,
  onClose,
  onPick,
}: {
  gradeLevel?: string | null;
  onClose: () => void;
  onPick: (pick: { subject: string; prompt: string }) => void;
}) {
  const initialLevel = useMemo(() => {
    const grade = Number.parseInt((gradeLevel ?? "").trim(), 10);
    if (Number.isFinite(grade) && grade >= 5 && grade <= 12) return `sinif-${grade}`;
    if (/mezun/i.test(gradeLevel ?? "")) return "tyt";
    return "sinif-11";
  }, [gradeLevel]);
  const [levelId, setLevelId] = useState(initialLevel);
  const [subject, setSubject] = useState("");
  const [free, setFree] = useState("");
  const level = CURRICULUM_LEVELS.find((item) => item.id === levelId) ?? CURRICULUM_LEVELS[0]!;
  const chosen = level.freeSubject ? free : subject;
  const pick = curriculumPick(level.id, chosen);

  return (
    <div className="apw-import" role="group" aria-label={WIZARD_COPY.pickCurriculum}>
      <p className="apw-drop-hint">{WIZARD_COPY.curriculumLead}</p>
      <div className="apw-chips" role="radiogroup" aria-label="Düzey">
        {CURRICULUM_LEVELS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={item.id === level.id}
            className={item.id === level.id ? "apw-chip apw-chip--on" : "apw-chip"}
            onClick={() => {
              setLevelId(item.id);
              setSubject("");
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {level.freeSubject ? (
        <input
          className="apw-import-input"
          value={free}
          onChange={(event) => setFree(event.target.value)}
          placeholder={WIZARD_COPY.curriculumFree}
          maxLength={60}
        />
      ) : (
        <div className="apw-chips" role="radiogroup" aria-label={WIZARD_COPY.curriculumSubject}>
          {level.subjects.map((name) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={name === subject}
              className={name === subject ? "apw-chip apw-chip--on" : "apw-chip"}
              onClick={() => setSubject(name)}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="apw-import-row">
        <button type="button" className="apw-drop-pick" disabled={!pick} onClick={() => pick && onPick(pick)}>
          {WIZARD_COPY.curriculumSubmit}
        </button>
        <button type="button" className="apw-ghost" onClick={onClose}>
          Vazgeç
        </button>
      </div>
    </div>
  );
}
