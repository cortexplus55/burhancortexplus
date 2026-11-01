"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronLeft, Landmark } from "lucide-react";
import { upcomingOfficialExams } from "@/lib/curriculum/calendar";
import {
  outcomeKey,
  plannedTopics,
  selectionCounts,
  subjectTotals,
  toggleOutcome,
  toggleUnit,
  type SetupSelection,
  type SetupTree,
  type UnitRating,
} from "@/lib/curriculum/official-setup-select";
import {
  OSYM_YKS_GUIDE_URL,
  SETUP_EXAMS,
  subjectKeysForAlan,
  YDT_NOTE,
  YKS_ALANLAR,
  type SetupExam,
  type YksAlan,
} from "@/lib/curriculum/yks-alan";
import { setFocusPrepCookieClient } from "@/lib/learning/focus-prep";
import { LevelCheckRunner, type LevelResult } from "@/components/level-check/level-check-runner";
import { foldResponses, masteryLabel, mergeRatings, scanRating } from "@/lib/level-check/mastery";
import { httpLevelApi, type LevelApi } from "@/lib/level-check/types";
import { OfficialLinks } from "@/components/curriculum/official-links";
import { isTreeExam, TREE_EXAMS, type TreeGroup } from "@/lib/curriculum/exam-trees";
import "@/styles/official-setup.css";

export type OfficialSetupBody = {
  title: string;
  examType: string;
  topics: string[];
  examDate: string;
  dailyMinutes: number;
  hardTopics: string[];
  topicOrderManual: true;
  learningPreferences: Record<string, unknown>;
};

/** Ağaç biçimi değişince artar; tarayıcıdaki eski (numaralı başlıklı) yanıt kullanılmaz. */
const SETUP_TREE_VERSION = 2;

type Step = "exam" | "subjects" | "topics" | "scan" | "date";
const STEPS: Step[] = ["exam", "subjects", "topics", "scan", "date"];

/** Havuz kimliği (1 tabanlı) → kurulum ağacı kimliği (0 tabanlı). */
function setupIdFromPool(poolId: string): string {
  const m = /^(.+)#(\d+)$/.exec(poolId);
  return m ? `${m[1]}#${Number(m[2]) - 1}` : poolId;
}

type ScanUnitResult = { setupId: string; title: string; right: number; total: number; rating: UnitRating | null; label: string };

/** Tarama yanıtlarından ünite başına tahmin (eşikler: mastery.ts `scanRating`). */
function scanSummary(results: LevelResult[]): ScanUnitResult[] {
  const byUnit = new Map<string, LevelResult[]>();
  for (const r of results) byUnit.set(r.item.unitId, [...(byUnit.get(r.item.unitId) ?? []), r]);
  return [...byUnit.entries()].map(([poolId, list]) => {
    const state = foldResponses(list.map((r) => ({ correct: r.correct, difficulty: r.item.difficulty })));
    return {
      setupId: setupIdFromPool(poolId),
      title: list[0]!.item.unitTitle,
      right: list.filter((r) => r.correct).length,
      total: list.length,
      rating: scanRating(state),
      label: masteryLabel(state).text,
    };
  });
}
const MINUTES = [30, 45, 60, 90, 120];
const RATING_LABEL: Record<UnitRating, string> = { iyi: "Biliyorum", orta: "Orta", zayif: "Zayıf" };
const EXAM_LABEL: Record<SetupExam, string> = {
  yks: "YKS",
  lgs: "LGS",
  kpss: "KPSS",
  ales: "ALES",
  dgs: "DGS",
  yds: "YDS",
  tus: "TUS",
  dus: "DUS",
};
const EXAM_CARD: Record<SetupExam, [string, string]> = {
  yks: ["YKS (TYT · AYT · YDT)", "ÖSYM Yükseköğretim Kurumları Sınavı"],
  lgs: ["LGS", "Liselere Geçiş Sistemi merkezî sınavı"],
  kpss: ["KPSS", TREE_EXAMS.kpss.card],
  ales: ["ALES", TREE_EXAMS.ales.card],
  dgs: ["DGS", TREE_EXAMS.dgs.card],
  yds: ["YDS", TREE_EXAMS.yds.card],
  tus: ["TUS", TREE_EXAMS.tus.card],
  dus: ["DUS", TREE_EXAMS.dus.card],
};
const EXAM_TRACK: Partial<Record<SetupExam, "kpss" | "tus" | "ales">> = { kpss: "kpss", tus: "tus", ales: "ales" };
const ALAN_TITLE: Record<YksAlan, string> = { tyt: "TYT", say: "Sayısal", ea: "Eşit Ağırlık", soz: "Sözel", dil: "Dil" };

function istanbulToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}

function trDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long" });
}

async function defaultSubmit(body: OfficialSetupBody): Promise<{ prepId?: string; error?: string }> {
  const res = await fetch("/api/learning/exam-prep/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await res.json().catch(() => ({}))) as { prepId?: string; error?: string };
  if (!res.ok) return { error: payload.error ?? "Plan kurulamadı." };
  return payload;
}

/**
 * Resmî sınav kurulumu (1 Kasım 2026): sınav → ders (alan çipleri) → ünite / kazanım ağacı → tarih ve süre → hazırlık.
 * Kurulumda model çağrısı ve belge sorusu yok; ağaç `/api/curriculum/setup` (kayıt defteri) ile gelir.
 */
export function OfficialSetupFlow({
  initialExam,
  initialAlan,
  submit = defaultSubmit,
  onCreated,
  levelApi = httpLevelApi,
}: {
  initialExam: SetupExam | null;
  initialAlan?: YksAlan | null;
  submit?: (body: OfficialSetupBody) => Promise<{ prepId?: string; error?: string }>;
  onCreated?: (prepId: string) => void;
  /** Hızlı Tarama istemcisi (e2e fikstürü sahte havuz verir). */
  levelApi?: LevelApi;
}) {
  const router = useRouter();
  const [exam, setExam] = useState<SetupExam | null>(initialExam);
  const [step, setStep] = useState<Step>(initialExam ? "subjects" : "exam");
  const [tree, setTree] = useState<SetupTree | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [alan, setAlan] = useState<YksAlan | null>(initialAlan ?? null);
  const [group, setGroup] = useState<string | null>(null);
  const [single, setSingle] = useState(false);
  const [selection, setSelection] = useState<SetupSelection>({ subjectKeys: [], removedOutcomes: [], removedUnits: [] });
  const [selfRatings, setRatings] = useState<Record<string, UnitRating>>({});
  const [scanRatings, setScanRatings] = useState<Record<string, UnitRating>>({});
  const [scanPhase, setScanPhase] = useState<"intro" | "run" | "result">("intro");
  const [scanResult, setScanResult] = useState<ScanUnitResult[]>([]);
  // Öğrencinin kendi işareti her zaman taramadan üstündür.
  const ratings = useMemo(() => mergeRatings(selfRatings, scanRatings), [selfRatings, scanRatings]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [examDate, setExamDate] = useState("");
  const [datePick, setDatePick] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const today = useMemo(istanbulToday, []);

  useEffect(() => {
    if (!exam) return;
    let live = true;
    setTree(null);
    setLoadError(false);
    fetch(`/api/curriculum/setup?sinav=${exam}&v=${SETUP_TREE_VERSION}`)
      .then((r) => (r.ok ? (r.json() as Promise<SetupTree>) : Promise.reject(new Error(String(r.status)))))
      .then((t) => {
        if (!live) return;
        setTree(t);
        const keys = exam !== "yks" ? t.subjects.map((s) => s.key) : alan ? subjectKeysForAlan(alan) : [];
        setGroup(null);
        setSelection({ subjectKeys: keys, removedOutcomes: [], removedUnits: [] });
      })
      .catch(() => live && setLoadError(true));
    return () => {
      live = false;
    };
    // Alan değişimi ağacı yeniden yüklemez; yalnız sınav değişimi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam]);

  const topics = useMemo(() => (tree ? plannedTopics(tree, selection) : []), [tree, selection]);
  const counts = selectionCounts(topics);
  const weakCount = topics.filter((t) => ratings[t.unitId] === "zayif").length;
  const knownCount = topics.filter((t) => ratings[t.unitId] === "iyi").length;
  const scanUsed = topics.filter((t) => !selfRatings[t.unitId] && scanRatings[t.unitId] && scanRatings[t.unitId] !== "orta").length;
  const alanDef = YKS_ALANLAR.find((a) => a.id === alan) ?? null;
  const treeDef = isTreeExam(exam) ? TREE_EXAMS[exam] : null;

  const examDates = useMemo(() => {
    const wanted = exam === "lgs" ? ["LGS"] : isTreeExam(exam) ? [TREE_EXAMS[exam].structureExam] : ["TYT", "AYT", "YDT"];
    return upcomingOfficialExams(today, 40).filter((e) => wanted.includes(e.exam));
  }, [exam, today]);

  function pickAlan(next: YksAlan) {
    setAlan(next);
    setSingle(false);
    setSelection({ subjectKeys: subjectKeysForAlan(next), removedOutcomes: [], removedUnits: [] });
  }

  function pickGroup(next: TreeGroup) {
    setGroup(next.id);
    setSingle(false);
    setSelection({ subjectKeys: [...next.keys], removedOutcomes: [], removedUnits: [] });
  }

  function toggleSubject(key: string) {
    setAlan(null);
    setGroup(null);
    setSelection((s) =>
      single
        ? { ...s, subjectKeys: [key] }
        : { ...s, subjectKeys: s.subjectKeys.includes(key) ? s.subjectKeys.filter((k) => k !== key) : [...s.subjectKeys, key] },
    );
  }

  function goDate() {
    if (!examDate) {
      const usesAyt = topics.some((t) => t.part === "AYT");
      const want = exam === "lgs" ? "LGS" : treeDef ? treeDef.structureExam : alan === "dil" ? "YDT" : usesAyt ? "AYT" : "TYT";
      const hit = examDates.find((e) => e.exam === want) ?? examDates[0];
      if (hit) {
        setExamDate(hit.date);
        setDatePick(hit.id);
      }
    }
    setStep("date");
  }

  async function create() {
    if (!exam || !topics.length || !examDate || examDate <= today) return;
    setBusy(true);
    const onlySubject = counts.subjects === 1 ? tree?.subjects.find((s) => s.key === topics[0]!.subjectKey)?.label : null;
    const title = treeDef
      ? onlySubject && single
        ? `${treeDef.name} ${onlySubject} Hazırlığı`
        : `${treeDef.name} Hazırlığı`
      : exam === "lgs"
        ? onlySubject && single
          ? `LGS ${onlySubject} Hazırlığı`
          : "LGS Hazırlığı"
        : alan
          ? `YKS ${ALAN_TITLE[alan]} Hazırlığı`
          : onlySubject
            ? `${onlySubject} Hazırlığı`
            : "YKS Hazırlığı";
    const body: OfficialSetupBody = {
      title,
      examType: EXAM_LABEL[exam],
      topics: topics.map((t) => t.topic),
      examDate,
      dailyMinutes: minutes,
      hardTopics: topics.filter((t) => ratings[t.unitId] === "zayif").map((t) => t.topic),
      topicOrderManual: true,
      learningPreferences: {
        examTrack: treeDef ? EXAM_TRACK[exam] : exam === "lgs" ? "lgs" : alan === "tyt" ? "tyt" : "yks",
        studyBand: exam === "lgs" ? "ortaokul" : exam === "tus" || exam === "dus" || exam === "ales" ? "universite" : "sinav",
        officialPlan: {
          exam,
          alan: exam === "yks" ? alan : null,
          singleSubject: single,
          units: topics.map((t) => ({
            topic: t.topic,
            programId: t.programId,
            part: t.part,
            unitId: t.unitId,
            codes: t.codes,
            rating: ratings[t.unitId] ?? null,
            ratingSource: selfRatings[t.unitId] ? "self" : scanRatings[t.unitId] ? "scan" : null,
          })),
        },
      },
    };
    try {
      const result = await submit(body);
      if (!result.prepId) {
        toast.error(result.error ?? "Plan kurulamadı.");
        return;
      }
      if (onCreated) {
        onCreated(result.prepId);
        return;
      }
      setFocusPrepCookieClient(result.prepId);
      router.push(`/deneme-sinavlari/${result.prepId}`);
      router.refresh();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setBusy(false);
    }
  }

  const stepIndex = STEPS.indexOf(step);
  const summary = (
    <p className="osf-summary" data-testid="setup-summary">
      {counts.subjects} ders · {counts.units} ünite · {counts.outcomes} kazanım
    </p>
  );

  return (
    <section className="osf" aria-label="Resmî sınav kurulumu">
      <div className="osf-progress" aria-hidden>
        <div className="osf-progress-fill" style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
      </div>
      {stepIndex > 0 && !(step === "subjects" && initialExam) ? (
        <button type="button" className="osf-back" onClick={() => setStep(STEPS[stepIndex - 1]!)}>
          <ChevronLeft className="h-4 w-4" aria-hidden /> Geri
        </button>
      ) : null}

      {step === "exam" ? (
        <div className="osf-step">
          <p className="osf-kicker">1 / 5 · Sınav</p>
          <h1 className="osf-title">Hangi sınava hazırlanıyorsun?</h1>
          <div className="osf-cards">
            {SETUP_EXAMS.map((id) => (
              <button
                key={id}
                type="button"
                className="osf-card"
                onClick={() => {
                  setExam(id);
                  setStep("subjects");
                }}
              >
                <Landmark className="h-5 w-5" aria-hidden />
                <strong>{EXAM_CARD[id][0]}</strong>
                <span>{EXAM_CARD[id][1]}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {exam && step !== "exam" && !tree ? (
        <p className="osf-lead" role="status">
          {loadError ? "Resmî konu listesi yüklenemedi. Sayfayı yenile." : "Resmî konu listesi hazırlanıyor…"}
        </p>
      ) : null}

      {tree && step === "subjects" ? (
        <div className="osf-step">
          <p className="osf-kicker">2 / 5 · Dersler</p>
          <h1 className="osf-title">
            {exam === "lgs" ? "LGS dersleri hazır" : treeDef ? `${treeDef.name} dersleri hazır` : "Alanını seç, derslerin gelsin"}
          </h1>
          {treeDef ? (
            <p className="osf-note" data-testid="tree-label">
              {treeDef.label}
            </p>
          ) : null}
          <p className="osf-lead">
            {treeDef
              ? single
                ? "Tek ders modu açık: çalışacağın dersi seç, yolun yalnız o dersle kurulur."
                : `${treeDef.name}'nin ${tree.subjects.length} dersi seçili geldi. Test çipleriyle daraltabilir, istediğin dersi kapatabilirsin.`
              : exam === "lgs"
              ? single
                ? "Tek ders modu açık: çalışacağın dersi seç, yolun yalnız o dersle kurulur."
                : `LGS'nin ${tree.subjects.length} dersi seçili geldi. Çalışmayacağın dersi kapatabilirsin.`
              : single
                ? "Tek ders modu açık: çalışacağın dersi seç, yolun yalnız o dersle kurulur."
                : "Alan çipleri dersleri ÖSYM'nin puan türü tablosuna göre seçer; istediğin dersi ekleyip çıkarabilirsin."}
          </p>
          {exam === "yks" ? (
            <div className="osf-chips" role="radiogroup" aria-label="Alan">
              {YKS_ALANLAR.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={alan === a.id}
                  className="osf-chip"
                  data-on={alan === a.id || undefined}
                  onClick={() => pickAlan(a.id)}
                >
                  {a.chip}
                </button>
              ))}
            </div>
          ) : null}
          {treeDef && treeDef.groups.length ? (
            <div className="osf-chips" role="radiogroup" aria-label="Test">
              {treeDef.groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  role="radio"
                  aria-checked={group === g.id}
                  className="osf-chip"
                  data-on={group === g.id || undefined}
                  onClick={() => pickGroup(g)}
                >
                  {g.chip}
                </button>
              ))}
            </div>
          ) : null}
          <label className="osf-switch">
            <input
              type="checkbox"
              role="switch"
              checked={single}
              onChange={(e) => {
                setSingle(e.target.checked);
                setAlan(null);
                setGroup(null);
                setSelection((s) => ({ ...s, subjectKeys: e.target.checked ? s.subjectKeys.slice(0, 1) : s.subjectKeys }));
              }}
            />
            <span>Yalnızca Tek Ders Seç</span>
          </label>
          {alanDef?.ydt ? (
            <p className="osf-note" data-testid="ydt-note">
              {YDT_NOTE}
            </p>
          ) : null}
          <ul className="osf-subjects">
            {tree.subjects.map((s) => {
              const on = selection.subjectKeys.includes(s.key);
              const totals = subjectTotals(s);
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    role={single ? "radio" : "checkbox"}
                    aria-checked={on}
                    className="osf-subject"
                    data-on={on || undefined}
                    onClick={() => toggleSubject(s.key)}
                  >
                    <strong>{s.label}</strong>
                    <span>
                      {totals.units} ünite · {totals.outcomes} kazanım
                      {treeDef ? ` · ${s.test}` : ""}
                      {s.questionCount ? ` · sınavda ${s.questionCount} soru` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {exam === "yks" ? (
            <p className="osf-source">
              Alan eşlemesi:{" "}
              <a href={OSYM_YKS_GUIDE_URL} target="_blank" rel="noreferrer">
                ÖSYM 2026-YKS Kılavuzu, Tablo 1B ve 1E
              </a>
              . Konular: MEB 2026 YKS&apos;ye esas kazanımlar.
            </p>
          ) : treeDef ? (
            <p className="osf-source">{treeDef.sourceNote}</p>
          ) : (
            <p className="osf-source">Konular: MEB LGS 2027 kapsamındaki 8. sınıf kazanımları.</p>
          )}
          {exam ? <OfficialLinks exam={exam} /> : null}
          <div className="osf-bar">
            {summary}
            <button type="button" className="osf-cta" disabled={!counts.units} onClick={() => setStep("topics")}>
              Konuları gör
            </button>
          </div>
        </div>
      ) : null}

      {tree && step === "topics" ? (
        <div className="osf-step">
          <p className="osf-kicker">3 / 5 · Konular</p>
          <h1 className="osf-title">Ünite ünite resmî konuların</h1>
          <p className="osf-lead">
            Her ünite yolunda bir konu olur. Çalışmayacağın üniteyi ya da kazanımı kaldır; her ünite için kendini bir dokunuşla değerlendir.
          </p>
          {tree.subjects
            .filter((s) => selection.subjectKeys.includes(s.key))
            .map((s) => {
              const subjectTopics = topics.filter((t) => t.subjectKey === s.key);
              return (
                <details key={s.key} className="osf-group" open={tree.subjects.length <= 1 || undefined}>
                  <summary>
                    <strong>{s.label}</strong>
                    <span>
                      {subjectTopics.length} ünite · {subjectTopics.reduce((n, t) => n + t.codes.length, 0)} kazanım
                    </span>
                    <ChevronDown className="h-4 w-4 osf-caret" aria-hidden />
                  </summary>
                  <ul className="osf-units">
                    {s.units.map((u) => {
                      const unitOn = !selection.removedUnits.includes(u.id);
                      const kept = u.outcomes.filter((o) => !selection.removedOutcomes.includes(outcomeKey(u.id, o.code))).length;
                      const live = unitOn && kept > 0;
                      return (
                        <li key={u.id} className="osf-unit" data-off={!live || undefined} data-testid="setup-unit">
                          <div className="osf-unit-row">
                            <label className="osf-check">
                              <input type="checkbox" checked={live} onChange={() => setSelection((sel) => toggleUnit(sel, u.id))} />
                              <span className="osf-unit-title">{u.title}</span>
                            </label>
                            <button
                              type="button"
                              className="osf-expand"
                              aria-expanded={Boolean(open[u.id])}
                              onClick={() => setOpen((o) => ({ ...o, [u.id]: !o[u.id] }))}
                            >
                              {kept}/{u.outcomes.length} kazanım
                            </button>
                          </div>
                          {live ? (
                            <div className="osf-rate" role="radiogroup" aria-label={`${u.title} öz değerlendirme`}>
                              {(Object.keys(RATING_LABEL) as UnitRating[]).map((r) => (
                                <button
                                  key={r}
                                  type="button"
                                  role="radio"
                                  aria-checked={ratings[u.id] === r}
                                  data-on={ratings[u.id] === r || undefined}
                                  data-tone={r}
                                  onClick={() => setRatings((x) => ({ ...x, [u.id]: r }))}
                                >
                                  {RATING_LABEL[r]}
                                </button>
                              ))}
                            </div>
                          ) : null}
                          {open[u.id] ? (
                            <ul className="osf-outcomes">
                              {u.outcomes.map((o) => (
                                <li key={o.code}>
                                  <label className="osf-check">
                                    <input
                                      type="checkbox"
                                      checked={unitOn && !selection.removedOutcomes.includes(outcomeKey(u.id, o.code))}
                                      onChange={() => setSelection((sel) => toggleOutcome(sel, u.id, o.code))}
                                    />
                                    <span>
                                      <b>{o.code}</b> {o.text}
                                    </span>
                                  </label>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              );
            })}
          <div className="osf-bar">
            {summary}
            <button
              type="button"
              className="osf-cta"
              disabled={!counts.units}
              onClick={() => {
                setScanPhase("intro");
                setStep("scan");
              }}
            >
              Bu konularla devam et
            </button>
          </div>
        </div>
      ) : null}

      {tree && step === "scan" ? (
        <div className="osf-step" data-testid="quick-scan">
          <p className="osf-kicker">4 / 5 · Seviye</p>
          <h1 className="osf-title">⚡ Akıllı Hızlı Tarama</h1>
          {scanPhase === "intro" && treeDef ? (
            <div className="lc-box" data-testid="scan-empty">
              <p className="osf-lead">
                Henüz hazır soru yok: {treeDef.name} konu ağacı için doğrulanmış soru havuzu henüz dolmadı. Yol sırası senin
                “Biliyorum / Orta / Zayıf” işaretinle kurulur.
              </p>
              <div className="osf-bar">
                <button type="button" className="osf-cta" onClick={goDate}>
                  Devam et
                </button>
              </div>
            </div>
          ) : null}
          {scanPhase === "intro" && !treeDef ? (
            <>
              <p className="osf-lead">
                10–12 soru, yaklaşık 3–5 dakika. Sorular seçtiğin derslerin en çok kazanım içeren ünitelerinden, doğrulanmış soru
                havuzundan gelir. Sonuç, işaretlemediğin ünitelerin yol sırasını belirler; senin “Biliyorum / Orta / Zayıf”
                işaretin her zaman önce gelir.
              </p>
              <div className="osf-bar">
                <button type="button" className="osf-skip" onClick={goDate}>
                  Taramayı atla
                </button>
                <button type="button" className="osf-cta" onClick={() => setScanPhase("run")}>
                  Taramayı başlat
                </button>
              </div>
            </>
          ) : null}
          {scanPhase === "run" ? (
            <LevelCheckRunner
              api={levelApi}
              request={{ mode: "quick_scan", units: topics.map((t) => t.unitId) }}
              title="Hızlı Tarama"
              onSkip={goDate}
              onFinish={(results) => {
                const summary = scanSummary(results);
                setScanResult(summary);
                setScanRatings(Object.fromEntries(summary.filter((u) => u.rating).map((u) => [u.setupId, u.rating!])));
                setScanPhase("result");
              }}
            />
          ) : null}
          {scanPhase === "result" ? (
            <>
              <p className="osf-lead">
                Ünite başına 1–2 soru çözdüğün için sonuçlar <b>tahmini</b>; yolda ünite başlarken kısa bir Ünite Seviye Kontrolü
                bunu netleştirir.
              </p>
              <ul className="lc-results" data-testid="scan-result">
                {scanResult.map((u) => (
                  <li key={u.setupId}>
                    <b>{u.title}</b>: {u.total} sorudan {u.right} doğru
                    {u.rating ? ` → ${RATING_LABEL[u.rating]} (${u.label})` : ""}
                    {selfRatings[u.setupId] ? ` · senin işaretin: ${RATING_LABEL[selfRatings[u.setupId]!]}` : ""}
                  </li>
                ))}
              </ul>
              <div className="osf-bar">
                {summary}
                <button type="button" className="osf-cta" onClick={goDate}>
                  Devam et
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {tree && step === "date" ? (
        <div className="osf-step">
          <p className="osf-kicker">5 / 5 · Tarih ve süre</p>
          <h1 className="osf-title">Sınav günün ve günlük süren</h1>
          <div className="osf-chips" role="radiogroup" aria-label="Resmî sınav tarihi">
            {examDates.map((e) => (
              <button
                key={e.id}
                type="button"
                role="radio"
                aria-checked={datePick === e.id}
                className="osf-chip"
                data-on={datePick === e.id || undefined}
                onClick={() => {
                  setExamDate(e.date);
                  setDatePick(e.id);
                }}
              >
                {e.label} · {trDate(e.date)}
              </button>
            ))}
          </div>
          <label className="osf-field">
            <span>Başka bir tarih</span>
            <input type="date" min={today} value={examDate} onChange={(e) => {
                setExamDate(e.target.value);
                setDatePick(null);
              }} />
          </label>
          <p className="osf-group-label">Günde ne kadar çalışabilirsin?</p>
          <div className="osf-chips" role="radiogroup" aria-label="Günlük süre">
            {MINUTES.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={minutes === m}
                className="osf-chip"
                data-on={minutes === m || undefined}
                onClick={() => setMinutes(m)}
              >
                {m < 60 ? `${m} dk` : m % 60 ? `${Math.floor(m / 60)} sa ${m % 60} dk` : `${m / 60} saat`}
              </button>
            ))}
          </div>
          <p className="osf-promise" data-testid="setup-promise">
            Yolun {counts.units} üniteyle kurulacak ({counts.outcomes} resmî kazanım).
            {weakCount
              ? ` “Zayıf” dediğin ${weakCount} ünite, aynı dersteki önceki ünitelerle birlikte yolun başına alınır.`
              : " Ünite sırası resmî programdaki gibidir."}
            {knownCount ? ` “Biliyorum” dediğin ${knownCount} ünite yolun sonuna alınır ve daha kısa sürer.` : ""}
            {scanUsed ? ` Bunların ${scanUsed} tanesi Hızlı Tarama tahmini (işaretlemediğin üniteler).` : ""}
          </p>
          <div className="osf-bar">
            {summary}
            <button type="button" className="osf-cta" disabled={busy || !examDate || examDate <= today} onClick={create}>
              {busy ? "Yolun kuruluyor…" : "Planımı Oluştur"}
            </button>
          </div>
        </div>
      ) : null}

      <p className="osf-alt">
        Kendi notun ya da kitabınla kurmak istersen <Link href="/deneme-sinavlari/olustur">belge yükleyerek başla</Link>.
      </p>
    </section>
  );
}
