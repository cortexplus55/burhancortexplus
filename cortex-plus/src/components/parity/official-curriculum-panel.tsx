"use client";

import { useEffect, useMemo, useState } from "react";
import { WIZARD_COPY, redundantUnitHeader } from "@/lib/learning/exam-wizard-copy";
import { CurriculumPickPanel } from "@/components/parity/curriculum-pick-panel";
import {
  buildTopicMap,
  DEFAULT_GRADE_SCOPES,
  hasSchoolExams,
  officialPrepTitle,
  levelForExamLabel,
  programIdForSubject,
  scenarioOptions,
  yksPartForLabel,
  type CurriculumTopicMap,
  type GradeScopes,
} from "@/lib/curriculum/topic-map";
import type {
  CurriculumExamKey,
  CurriculumProgram,
  CurriculumProgramSummary,
  CurriculumRef,
  CurriculumScenario,
  CurriculumSource,
  YksPart,
} from "@/lib/curriculum/types";

export type OfficialCurriculumPick = {
  program: CurriculumProgram;
  ref: CurriculumRef;
  map: CurriculumTopicMap;
  sources: CurriculumSource[];
  /** Seçilen kapsama göre hazırlık adı (TYT/AYT sınıf aralığı dahil). */
  title: string;
};

const EXAM_OPTIONS: { key: CurriculumExamKey; label: string }[] = [
  { key: "d1y1", label: "1. Dönem 1. Yazılı" },
  { key: "d1y2", label: "1. Dönem 2. Yazılı" },
  { key: "serbest", label: "Serbest Ünite Seçimi" },
];

const EXAM_LEVELS: Record<string, { label: string; order: number }> = {
  lgs: { label: "LGS", order: 100 },
  yks: { label: "YKS (TYT / AYT)", order: 101 },
  kpss: { label: "KPSS", order: 102 },
};

function levelKey(p: Pick<CurriculumProgramSummary, "kind" | "grade">): string {
  return p.kind === "okul" ? `sinif-${p.grade}` : p.kind;
}

function levelLabel(key: string): string {
  return EXAM_LEVELS[key]?.label ?? `${key.replace("sinif-", "")}. sınıf`;
}

function levelOrder(key: string): number {
  return EXAM_LEVELS[key]?.order ?? Number(key.replace("sinif-", ""));
}

const PART_OPTIONS: { key: "TYT" | "AYT" | null; label: string }[] = [
  { key: "TYT", label: "TYT" },
  { key: "AYT", label: "AYT" },
  { key: null, label: "Tümü (YKS)" },
];

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
  const [scopes, setScopes] = useState<GradeScopes>(DEFAULT_GRADE_SCOPES);
  /** undefined = sınav türünden; null = tüm YKS. */
  const [partId, setPartId] = useState<"TYT" | "AYT" | null | undefined>(undefined);

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
    return keys.sort((a, b) => levelOrder(a) - levelOrder(b));
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
      .then((body: { program: CurriculumProgram; sources: CurriculumSource[]; gradeScopes?: GradeScopes }) => {
        if (!live) return;
        setDetail(body);
        if (body.gradeScopes) setScopes(body.gradeScopes);
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
  const yksPart: "TYT" | "AYT" | null =
    program?.kind === "yks" ? (partId === undefined ? yksPartForLabel(examLabel) : partId) : null;
  const examChoices = program && schoolExams
    ? EXAM_OPTIONS.filter((o) => o.key === "serbest" || program.exams[o.key])
    : [];
  const scenarios = program ? scenarioOptions(program, examKey) : [];
  const effectiveScenario: CurriculumScenario | null =
    examKey === "serbest" || !scenarios.length ? null : scenario === "karma" || scenarios.includes(scenario) ? scenario : "karma";
  const map = useMemo(
    () => (program ? buildTopicMap(program, examKey, effectiveScenario, { part: yksPart, scopes }) : null),
    [program, examKey, effectiveScenario, yksPart, scopes],
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
                onClick={() => {
                  setProgramId(p.id);
                  setPartId(undefined);
                }}
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
            <>
              <p className="apw-official-label">{WIZARD_COPY.officialYksPart}</p>
              <div className="apw-chips" role="radiogroup" aria-label={WIZARD_COPY.officialYksPart}>
                {PART_OPTIONS.map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    role="radio"
                    aria-checked={o.key === yksPart}
                    className={o.key === yksPart ? "apw-chip apw-chip--on" : "apw-chip"}
                    onClick={() => setPartId(o.key)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <p className="apw-drop-hint" role="note" data-testid="yks-split-note">
                {WIZARD_COPY.officialPartScope(yksPart ?? "YKS", scopes[yksPart ?? "YKS"])}
              </p>
              {!map.topics.length ? (
                <p className="apw-drop-hint" role="alert" data-testid="yks-part-empty">
                  {WIZARD_COPY.officialPartEmpty(yksPart ?? "YKS")}
                </p>
              ) : null}
            </>
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
            {map.topics.length} konu · {map.outcomeCount} kazanım
            {map.total ? ` · ${map.total} soru${map.averaged ? " (senaryoların ortalaması)" : " (resmî tablo)"}` : ""}
          </p>
          <ol className="apw-official-map" aria-label="Konu haritası">
            {map.units.map((unit) =>
              redundantUnitHeader(unit.title, unit.topicIndexes.map((i) => map.topics[i] ?? "")) ? (
                <li key={unit.title} data-testid="official-unit-single">
                  <strong>{unit.title}</strong>
                  <small className="apw-official-count"> · {map.topicCodes[unit.topicIndexes[0]!]!.length} kazanım</small>
                  {map.quotaByTopic[unit.topicIndexes[0]!] ? <em className="apw-official-quota">{map.quotaByTopic[unit.topicIndexes[0]!]} soru</em> : null}
                </li>
              ) : (
              <li key={unit.title}>
                <strong>{unit.title}</strong>
                <ul>
                  {unit.topicIndexes.map((i) => (
                    <li key={i}>
                      <span>{map.topics[i]}</span>
                      <small className="apw-official-count"> · {map.topicCodes[i]!.length} kazanım</small>
                      {map.quotaByTopic[i] ? <em className="apw-official-quota">{map.quotaByTopic[i]} soru</em> : null}
                    </li>
                  ))}
                </ul>
              </li>
              ),
            )}
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
              ref: { programId: program.id, examKey, scenario: effectiveScenario, ...(yksPart ? { part: yksPart } : {}) },
              title: officialPrepTitle(program.label, yksPart, scopes),
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
