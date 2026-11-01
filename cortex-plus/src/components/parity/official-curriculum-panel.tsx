"use client";

import { useEffect, useMemo, useState } from "react";
import { WIZARD_COPY } from "@/lib/learning/exam-wizard-copy";
import { CurriculumPickPanel } from "@/components/parity/curriculum-pick-panel";
import {
  buildTopicMap,
  hasSchoolExams,
  levelForExamLabel,
  programIdForSubject,
  scenarioOptions,
  yksPartForLabel,
  type CurriculumTopicMap,
} from "@/lib/curriculum/topic-map";
import type {
  CurriculumExamKey,
  CurriculumProgram,
  CurriculumProgramSummary,
  CurriculumRef,
  CurriculumScenario,
  CurriculumSource,
} from "@/lib/curriculum/types";

export type OfficialCurriculumPick = {
  program: CurriculumProgram;
  ref: CurriculumRef;
  map: CurriculumTopicMap;
  sources: CurriculumSource[];
};

const EXAM_OPTIONS: { key: CurriculumExamKey; label: string }[] = [
  { key: "d1y1", label: "1. Dönem 1. Yazılı" },
  { key: "d1y2", label: "1. Dönem 2. Yazılı" },
  { key: "serbest", label: "Serbest Ünite Seçimi" },
];

function levelKey(p: Pick<CurriculumProgramSummary, "kind" | "grade">): string {
  return p.kind === "yks" ? "yks" : `sinif-${p.grade}`;
}

function levelLabel(key: string): string {
  return key === "yks" ? "YKS (TYT / AYT)" : `${key.replace("sinif-", "")}. sınıf`;
}

/**
 * Resmî müfredattan kurulum (1 Kasım 2026). Program, yazılı ve senaryo seçilir; konu haritası kayıttaki
 * resmî tablodan anında çıkar (model çağrısı yok). Kayıtta olmayan ders için eski sohbetli yol kalır.
 */
export function OfficialCurriculumPanel({
  gradeLevel,
  examLabel = null,
  subject = null,
  onClose,
  onPick,
  onChatFallback,
}: {
  gradeLevel?: string | null;
  /** Ders/sınav adımında seçilen sınav türü (TYT, AYT, LGS, "10. sınıf"…); düzeyi önceden seçer. */
  examLabel?: string | null;
  /** Sihirbazda seçilen ders; düzeyde varsa programı önceden seçer. */
  subject?: string | null;
  onClose: () => void;
  onPick: (pick: OfficialCurriculumPick) => void;
  onChatFallback: (pick: { subject: string; prompt: string }) => void;
}) {
  const [programs, setPrograms] = useState<CurriculumProgramSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [levelId, setLevelId] = useState<string | null>(null);
  const [programId, setProgramId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ program: CurriculumProgram; sources: CurriculumSource[] } | null>(null);
  const [examKey, setExamKey] = useState<CurriculumExamKey>("d1y1");
  const [scenario, setScenario] = useState<CurriculumScenario>("karma");

  useEffect(() => {
    let live = true;
    fetch("/api/curriculum")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: { programs: CurriculumProgramSummary[] }) => live && setPrograms(body.programs))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const levels = useMemo(() => {
    const keys = [...new Set((programs ?? []).map(levelKey))];
    return keys.sort((a, b) => (a === "yks" ? 1 : b === "yks" ? -1 : Number(a.slice(6)) - Number(b.slice(6))));
  }, [programs]);

  const activeLevel = useMemo(() => {
    if (levelId && levels.includes(levelId)) return levelId;
    const fromExam = levelForExamLabel(examLabel);
    if (fromExam && levels.includes(fromExam)) return fromExam;
    const grade = Number.parseInt((gradeLevel ?? "").trim(), 10);
    if (Number.isFinite(grade) && levels.includes(`sinif-${grade}`)) return `sinif-${grade}`;
    if (/mezun/i.test(gradeLevel ?? "") && levels.includes("yks")) return "yks";
    return levels[0] ?? null;
  }, [levelId, levels, gradeLevel, examLabel]);

  const levelPrograms = (programs ?? []).filter((p) => levelKey(p) === activeLevel);
  const subjectPick = programId ? null : programIdForSubject(levelPrograms, subject);
  useEffect(() => {
    if (subjectPick) setProgramId(subjectPick);
  }, [subjectPick]);

  useEffect(() => {
    if (!programId) return;
    let live = true;
    setDetail(null);
    fetch(`/api/curriculum/${encodeURIComponent(programId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: { program: CurriculumProgram; sources: CurriculumSource[] }) => {
        if (!live) return;
        setDetail(body);
        const keys = EXAM_OPTIONS.map((o) => o.key).filter((k) => k === "serbest" || body.program.exams[k]);
        setExamKey(keys[0] ?? "serbest");
        setScenario("karma");
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [programId]);

  const program = detail?.program ?? null;
  const schoolExams = program ? hasSchoolExams(program) : false;
  const yksPart = program?.kind === "yks" ? yksPartForLabel(examLabel) : null;
  const examChoices = program && schoolExams
    ? EXAM_OPTIONS.filter((o) => o.key === "serbest" || program.exams[o.key])
    : [];
  const scenarios = program ? scenarioOptions(program, examKey) : [];
  const effectiveScenario: CurriculumScenario | null =
    examKey === "serbest" || !scenarios.length ? null : scenario === "karma" || scenarios.includes(scenario) ? scenario : "karma";
  const map = useMemo(
    () => (program ? buildTopicMap(program, examKey, effectiveScenario) : null),
    [program, examKey, effectiveScenario],
  );

  if (fallback) {
    return <CurriculumPickPanel gradeLevel={gradeLevel} onClose={() => setFallback(false)} onPick={onChatFallback} />;
  }

  return (
    <div className="apw-import apw-official" role="group" aria-label={WIZARD_COPY.pickCurriculum}>
      <p className="apw-drop-hint">{WIZARD_COPY.officialLead}</p>
      {failed ? <p className="apw-drop-hint" role="alert">{WIZARD_COPY.officialFailed}</p> : null}
      {!programs && !failed ? <p className="apw-drop-hint" role="status">{WIZARD_COPY.officialLoading}</p> : null}
      {programs ? (
        <>
          <div className="apw-chips" role="radiogroup" aria-label="Düzey">
            {levels.map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={key === activeLevel}
                className={key === activeLevel ? "apw-chip apw-chip--on" : "apw-chip"}
                onClick={() => {
                  setLevelId(key);
                  setProgramId(null);
                  setDetail(null);
                }}
              >
                {levelLabel(key)}
              </button>
            ))}
          </div>
          <div className="apw-chips" role="radiogroup" aria-label={WIZARD_COPY.curriculumSubject}>
            {levelPrograms.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={p.id === programId}
                className={p.id === programId ? "apw-chip apw-chip--on" : "apw-chip"}
                onClick={() => setProgramId(p.id)}
              >
                {p.subject}
              </button>
            ))}
          </div>
        </>
      ) : null}
      {programId && !program && !failed ? <p className="apw-drop-hint" role="status">{WIZARD_COPY.officialLoading}</p> : null}
      {program && map ? (
        <div className="apw-official-body">
          <p className="apw-official-badges">
            <span className="apw-official-badge">{program.badge}</span>
            <span className="apw-official-badge apw-official-badge--muted">{program.programVersion}</span>
          </p>
          {examChoices.length ? (
          <>
          <p className="apw-official-label">{WIZARD_COPY.officialWhichExam}</p>
          <div className="apw-chips" role="radiogroup" aria-label={WIZARD_COPY.officialWhichExam}>
            {examChoices.map((o) => (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={o.key === examKey}
                className={o.key === examKey ? "apw-chip apw-chip--on" : "apw-chip"}
                onClick={() => setExamKey(o.key)}
              >
                {o.label}
              </button>
            ))}
          </div>
          </>
          ) : null}
          {program.kind === "yks" ? (
            <p className="apw-drop-hint" role="note" data-testid="yks-split-note">
              {yksPart ? `${yksPart}: ` : ""}
              {WIZARD_COPY.officialNoYksSplit}
            </p>
          ) : null}
          {scenarios.length ? (
            <>
              <p className="apw-official-label">{WIZARD_COPY.officialScenario}</p>
              <div className="apw-chips" role="radiogroup" aria-label={WIZARD_COPY.officialScenario}>
                {scenarios.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={effectiveScenario === n}
                    className={effectiveScenario === n ? "apw-chip apw-chip--on" : "apw-chip"}
                    onClick={() => setScenario(n)}
                  >
                    Senaryo {n}
                  </button>
                ))}
                <button
                  type="button"
                  role="radio"
                  aria-checked={effectiveScenario === "karma"}
                  className={effectiveScenario === "karma" ? "apw-chip apw-chip--on" : "apw-chip"}
                  onClick={() => setScenario("karma")}
                >
                  {WIZARD_COPY.officialKarma}
                </button>
              </div>
              <p className="apw-drop-hint">{WIZARD_COPY.officialScenarioHint}</p>
            </>
          ) : null}
          {map.national ? <p className="apw-drop-hint" role="note">{WIZARD_COPY.officialNational}</p> : null}
          <p className="apw-official-summary" data-testid="official-summary">
            {map.topics.length} kazanım
            {map.total ? ` · ${map.total} soru${map.averaged ? " (senaryoların ortalaması)" : " (resmî tablo)"}` : ""}
          </p>
          <ol className="apw-official-map" aria-label="Konu haritası">
            {map.units.map((unit) => (
              <li key={unit.title}>
                <strong>{unit.title}</strong>
                <ul>
                  {unit.topicIndexes.map((i) => (
                    <li key={map.codes[i]}>
                      <span>{map.topics[i]}</span>
                      {map.quotaByCode[map.codes[i]!] ? (
                        <em className="apw-official-quota">{map.quotaByCode[map.codes[i]!]} soru</em>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <p className="apw-official-sources">
            {WIZARD_COPY.officialSource}:{" "}
            {(detail?.sources ?? []).map((s, i) => (
              <span key={s.id}>
                {i ? " · " : ""}
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.title}
                </a>
              </span>
            ))}
          </p>
        </div>
      ) : null}
      <div className="apw-import-row">
        <button
          type="button"
          className="apw-drop-pick"
          disabled={!program || !map?.topics.length}
          onClick={() =>
            program &&
            map &&
            onPick({
              program,
              map,
              sources: detail?.sources ?? [],
              ref: { programId: program.id, examKey, scenario: effectiveScenario },
            })
          }
        >
          {WIZARD_COPY.officialSubmit}
        </button>
        <button type="button" className="apw-ghost" onClick={onClose}>
          Vazgeç
        </button>
      </div>
      <button type="button" className="apw-link" onClick={() => setFallback(true)}>
        {WIZARD_COPY.officialMissing}
      </button>
    </div>
  );
}
