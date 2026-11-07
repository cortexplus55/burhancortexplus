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
  sourceDisplayTitle,
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
} from "@/lib/curriculum/types";
import { ExternalAnchor } from "@/components/ui/external-anchor";
import "@/styles/official-curriculum.css";

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
  ales: { label: "ALES", order: 103 },
  dgs: { label: "DGS", order: 104 },
  yds: { label: "YDS", order: 105 },
  tus: { label: "TUS", order: 106 },
  dus: { label: "DUS", order: 107 },
};

function levelKey(p: Pick<CurriculumProgramSummary, "kind" | "grade">): string {
  return p.kind === "okul" ? `sinif-${p.grade}` : p.kind;
}

export function levelLabel(key: string): string {
  if (EXAM_LEVELS[key]) return EXAM_LEVELS[key].label;
  // Bilinmeyen sınav türü "xyz. sınıf" yazılmaz (2 Kasım 2026: "tus. sınıf" görünüyordu).
  return /^sinif-\d+$/.test(key) ? `${key.replace("sinif-", "")}. sınıf` : key.toLocaleUpperCase("tr-TR");
}

function levelOrder(key: string): number {
  return EXAM_LEVELS[key]?.order ?? (Number(key.replace("sinif-", "")) || 999);
}

/**
 * Derin ağacı olan sınav dersinde eski `-2026-tree-` programı yeni kurulumda gösterilmez (aynı ad iki kez çıkmasın);
 * kayıtta kalır, mevcut hazırlıklar kendi programını okumaya devam eder.
 */
export function withoutSupersededTrees<T extends { id: string }>(programs: T[]): T[] {
  const ids = new Set(programs.map((p) => p.id));
  return programs.filter((p) => !(p.id.includes("-2026-tree-") && ids.has(p.id.replace("-2026-tree-", "-2026-deep-"))));
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
  /** Seçilen sınavın düzeyi dışındakiler varsayılan gizli; öğrenci isterse açar. */
  const [allLevels, setAllLevels] = useState(false);
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
      .then((body: { programs: CurriculumProgramSummary[] }) => live && setPrograms(withoutSupersededTrees(body.programs)))
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

  const examLevel = levelForExamLabel(examLabel);
  const lockedToExam = !allLevels && !!examLevel && levels.includes(examLevel);
  const visibleLevels = lockedToExam ? [examLevel] : levels;
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

  /*
    8 Kasım 2026 yeniden tasarım (ürün sahibi: "basit, özensiz ve karışık"). Numaralı adımlar (düzey → ders → yazılı →
    senaryo), her adım kendi başlığıyla; seçim bitince konu haritası ayrı kartta, sayılar üç kutuda. Radyo adları,
    `official-summary` metni ve "Bu konularla devam et" testlerin dayandığı adlar; değişmedi.
  */
  let stepNo = 0;
  const nextNo = () => (stepNo += 1);
  const ready = Boolean(program && map?.topics.length);

  return (
    <div className="apw-import apw-official ocp" role="group" aria-label={WIZARD_COPY.pickCurriculum}>
      <header className="ocp-head">
        <span className="ocp-head-icon" aria-hidden>
          🏛️
        </span>
        <span className="ocp-head-text">
          <strong>Resmî müfredattan kur</strong>
          <span>{WIZARD_COPY.officialLead}</span>
        </span>
      </header>
      {failed ? (
        <p className="ocp-alert" role="alert">
          {WIZARD_COPY.officialFailed}
        </p>
      ) : null}
      {!programs && !failed ? (
        <p className="ocp-loading" role="status">
          <span className="ocp-spinner" aria-hidden />
          {WIZARD_COPY.officialLoading}
        </p>
      ) : null}
      {programs ? (
        <ol className="ocp-steps">
          <li className="ocp-step">
            <span className="ocp-num" aria-hidden>
              {nextNo()}
            </span>
            <div className="ocp-step-body">
              <p className="ocp-step-title">Sınıf ya da sınav</p>
              <div className="apw-chips" role="radiogroup" aria-label="Düzey">
                {visibleLevels.map((key) => (
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
                {lockedToExam ? (
                  <button type="button" className="apw-link ocp-more" onClick={() => setAllLevels(true)} data-testid="official-other-levels">
                    Başka sınıf/sınav
                  </button>
                ) : null}
              </div>
            </div>
          </li>
          <li className="ocp-step">
            <span className="ocp-num" aria-hidden>
              {nextNo()}
            </span>
            <div className="ocp-step-body">
              <p className="ocp-step-title">{WIZARD_COPY.curriculumSubject}</p>
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
              {program ? (
                <p className="ocp-badge-row">
                  <span className="apw-official-badge">{program.badge}</span>
                </p>
              ) : null}
            </div>
          </li>
          {program && examChoices.length ? (
            <li className="ocp-step">
              <span className="ocp-num" aria-hidden>
                {nextNo()}
              </span>
              <div className="ocp-step-body">
                <p className="ocp-step-title">{WIZARD_COPY.officialWhichExam}</p>
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
              </div>
            </li>
          ) : null}
          {program && map && program.kind === "yks" ? (
            <li className="ocp-step">
              <span className="ocp-num" aria-hidden>
                {nextNo()}
              </span>
              <div className="ocp-step-body">
                <p className="ocp-step-title">{WIZARD_COPY.officialYksPart}</p>
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
                <p className="ocp-hint" role="note" data-testid="yks-split-note">
                  {WIZARD_COPY.officialPartScope(yksPart ?? "YKS", scopes[yksPart ?? "YKS"])}
                </p>
                {!map.topics.length ? (
                  <p className="ocp-alert" role="alert" data-testid="yks-part-empty">
                    {WIZARD_COPY.officialPartEmpty(yksPart ?? "YKS")}
                  </p>
                ) : null}
              </div>
            </li>
          ) : null}
          {program && scenarios.length ? (
            <li className="ocp-step">
              <span className="ocp-num" aria-hidden>
                {nextNo()}
              </span>
              <div className="ocp-step-body">
                <p className="ocp-step-title">{WIZARD_COPY.officialScenario}</p>
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
                <p className="ocp-hint">{WIZARD_COPY.officialScenarioHint}</p>
              </div>
            </li>
          ) : null}
        </ol>
      ) : null}
      {programId && !program && !failed ? (
        <p className="ocp-loading" role="status">
          <span className="ocp-spinner" aria-hidden />
          {WIZARD_COPY.officialLoading}
        </p>
      ) : null}
      {program && map ? (
        <section className="ocp-map-card" aria-label="Konu haritası özeti">
          <div className="ocp-stats" aria-hidden>
            <span className="ocp-stat">
              <strong>{map.topics.length}</strong>
              <small>konu</small>
            </span>
            <span className="ocp-stat">
              <strong>{map.outcomeCount}</strong>
              <small>kazanım</small>
            </span>
            {map.total ? (
              <span className="ocp-stat">
                <strong>{map.total}</strong>
                <small>{map.averaged ? "soru (ortalama)" : "soru"}</small>
              </span>
            ) : null}
          </div>
          <p className="apw-official-summary" data-testid="official-summary">
            {map.topics.length} konu · {map.outcomeCount} kazanım
            {map.total ? ` · ${map.total} soru${map.averaged ? " (senaryoların ortalaması)" : " (resmî tablo)"}` : ""}
          </p>
          {map.national ? (
            <p className="ocp-hint" role="note">
              {WIZARD_COPY.officialNational}
            </p>
          ) : null}
          <ol className="apw-official-map ocp-map" aria-label="Konu haritası">
            {map.units.map((unit) =>
              redundantUnitHeader(unit.title, unit.topicIndexes.map((i) => map.topics[i] ?? "")) ? (
                <li key={unit.title} className="ocp-unit ocp-unit--single" data-testid="official-unit-single">
                  <span className="ocp-row">
                    <strong className="ocp-row-title">{unit.title}</strong>
                    <span className="ocp-row-meta">
                      <small className="apw-official-count ocp-pill">{map.topicCodes[unit.topicIndexes[0]!]!.length} kazanım</small>
                      {map.quotaByTopic[unit.topicIndexes[0]!] ? (
                        <em className="apw-official-quota ocp-pill ocp-pill--quota">{map.quotaByTopic[unit.topicIndexes[0]!]} soru</em>
                      ) : null}
                    </span>
                  </span>
                </li>
              ) : (
                <li key={unit.title} className="ocp-unit">
                  <strong className="ocp-unit-title">{unit.title}</strong>
                  <ul>
                    {unit.topicIndexes.map((i) => (
                      <li key={i} className="ocp-row">
                        <span className="ocp-row-title">{map.topics[i]}</span>
                        <span className="ocp-row-meta">
                          <small className="apw-official-count ocp-pill">{map.topicCodes[i]!.length} kazanım</small>
                          {map.quotaByTopic[i] ? <em className="apw-official-quota ocp-pill ocp-pill--quota">{map.quotaByTopic[i]} soru</em> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ),
            )}
          </ol>
          <p className="apw-official-sources ocp-sources">
            {WIZARD_COPY.officialSource}:{" "}
            {(detail?.sources ?? []).map((s, i) => (
              <span key={s.id}>
                {i ? " · " : ""}
                <ExternalAnchor href={s.url}>{sourceDisplayTitle(s.title)}</ExternalAnchor>
              </span>
            ))}
          </p>
        </section>
      ) : null}
      <div className="ocp-footer">
        <p className="ocp-free" data-testid="curriculum-free-note">
          <strong>Hazır içerikle çalış — ücretsiz</strong> · Hazır içerik kredi harcamaz. Ücretsiz hesapta ilk konu açık, tüm konular Plus ile.
        </p>
        <div className="ocp-actions">
          <button
            type="button"
            className="apw-cta ocp-submit"
            disabled={!ready}
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
          <button type="button" className="apw-ghost ocp-cancel" onClick={onClose}>
            Vazgeç
          </button>
        </div>
        <button type="button" className="apw-link ocp-missing" onClick={() => setFallback(true)}>
          {WIZARD_COPY.officialMissing}
        </button>
      </div>
    </div>
  );
}
