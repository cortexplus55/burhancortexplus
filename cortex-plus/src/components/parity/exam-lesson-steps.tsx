"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronLeft, CornerDownLeft, Info, X } from "lucide-react";
import { honestReadingMinutes } from "@/lib/learning/lesson-coherence";
import type { LessonV2 } from "@/lib/learning/teaching-standards";
import { displaySolution, isPromptEcho } from "@/lib/learning/oral-review";
import { LessonDiagramView } from "@/components/parity/lesson-diagram";
import {
  calloutTone,
  checkPresentation,
  isDistinctRetryVariant,
  reviewGateLead,
  reviewGateQuestion,
  trueFalseIndexes,
} from "@/lib/learning/lesson-chrome";
import type { MaterialLanguage } from "@/lib/learning/teacher-brain";
import {
  layoutBoard,
  overviewDuplicatesSection,
  type BoardLine,
} from "@/lib/learning/lesson-board";
import { RichBody } from "@/components/parity/lesson-rich-text";
import type {
  CheckGradeVariant,
  GradeCheckResult,
  LessonCheckAnswer,
  PublicSectionCheck,
} from "@/lib/learning/lesson-play";
import { planLine, publicLessonV2Schema } from "@/lib/learning/lesson-play";
import type { PublicLessonBlock, PublicLessonV3 } from "@/lib/learning/lesson-play-v3";
import {
  conceptGroups,
  isLessonV3,
  screenText,
  v2ToV3,
  v3ToV2,
  type LessonBlock,
  type LessonV3,
} from "@/lib/learning/lesson-v3";
import { isNearDuplicateText, stripInlineSourceLine } from "@/lib/learning/lesson-source";
import type { z } from "zod";
import "@/styles/exam-lesson-steps.css";

/**
 * Dersi adım adım göster.
 *
 * Her adım kendi slaytı: anlatım, gömülü doğru/yanlış ya da hızlı sınav,
 * ardından açıklama. Yanlışlar dersin sonunda bir kez daha sorulur.
 */

/** Adım satırı mı? */

function stepLine(text: string): boolean {
  return /^(?:Veri|Adım\s*\d+)\s*:/i.test(text.trim());
}

function BoardBody({
  text,
  className,
  topicHint = "",
}: {
  text: string;
  className?: string;
  topicHint?: string;
}) {
  const lines = layoutBoard(text);
  const rendered: BoardLine[] = lines.length ? lines : [{ kind: "prose", text }];
  const blocks: Array<{ kind: "line"; line: BoardLine; index: number } | { kind: "steps"; lines: BoardLine[]; index: number }> = [];
  for (let index = 0; index < rendered.length; index += 1) {
    const line = rendered[index];
    const previous = blocks[blocks.length - 1];
    if (stepLine(line.text) && previous?.kind === "steps") {
      previous.lines.push(line);
      continue;
    }
    if (stepLine(line.text)) {
      blocks.push({ kind: "steps", lines: [line], index });
      continue;
    }
    blocks.push({ kind: "line", line, index });
  }
  return (
    <div className={className ?? "als-body"}>
      {blocks.map((block) =>
        block.kind === "steps" ? (
          <ol key={block.index} className="als-steps">
            {block.lines.map((line, index) => (
              <li key={index}>
                <RichBody text={line.text} topicHint={topicHint} />
              </li>
            ))}
          </ol>
        ) : block.line.kind === "formula" ? (
          <p key={block.index} className="als-formula">
            <RichBody text={block.line.text} topicHint={topicHint} />
          </p>
        ) : (
          <p key={block.index}>
            <RichBody text={block.line.text} topicHint={topicHint} />
          </p>
        ),
      )}
    </div>
  );
}

/**
 * Kaynak künyesi (dosya + sayfa) artık gövde metninin bir parçası değil —
 * öğrencinin ana okuma akışında yer kaplamayan küçük, tıklanabilir bir
 * rozet. Floating popover yerine satır içi aç/kapa: bir dış katman/portal
 * olmadığı için mobilde ekran dışına taşma riski yok.
 */
function SourceBadge({ source }: { source: { file: string; page?: number } }) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const label = source.page ? `${source.file}, s.${source.page}` : source.file;
  return (
    <div className="als-source">
      <button
        type="button"
        className="als-source-trigger"
        aria-expanded={open}
        aria-controls={detailId}
        aria-label={open ? `Kaynağı gizle: ${label}` : `Kaynağı göster: ${label}`}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <Info className="h-3 w-3" aria-hidden />
        Kaynak
      </button>
      {open ? (
        <span id={detailId} role="note" className="als-source-detail">
          {label}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Bağıntı gövdeye gömülmez, ayrı bir kart olarak durur — Astra
 * karşılaştırmasında gövdeye sıkışan formüllerin gövdeyi hem uzatıp hem
 * okunaksızlaştırdığı görüldü. `.als-formula` adı `RichBody`'nin satır içi
 * matematik bloğu tarafından zaten kullanılıyor; çakışmasın diye bu kart
 * `.als-formula-card`.
 */
function FormulaCard({ formula }: { formula: NonNullable<LessonV2["sections"][number]["formula"]> }) {
  return (
    <div className="als-formula-card">
      <p className="als-formula-card-title">{formula.title}</p>
      <p className="als-formula-card-expr">
        <RichBody text={formula.expression} />
      </p>
      {formula.note ? <p className="als-formula-card-note">{formula.note}</p> : null}
    </div>
  );
}

/** Mekanizma düz paragraf değil, numaralı ve uygulanabilir adım listesi. */
function ProcedureList({ procedure }: { procedure: NonNullable<LessonV2["sections"][number]["procedure"]> }) {
  return (
    <div className="als-procedure">
      {procedure.title ? <p className="als-procedure-title">{procedure.title}</p> : null}
      <ol>
        {procedure.steps.map((step, index) => (
          <li key={index}>
            <span className="als-procedure-label">{step.label}</span>
            <span className="als-procedure-detail">{step.detail}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Küçük referans tablosu (persentil↔SD gibi karşılıklar). */
function ReferenceTable({ table }: { table: NonNullable<LessonV2["sections"][number]["table"]> }) {
  return (
    <div className="als-reference-table">
      {table.caption ? <p className="als-reference-table-caption">{table.caption}</p> : null}
      <div className="als-reference-table-scroll">
        <table>
          <thead>
            <tr>
              {table.columns.map((column, index) => (
                <th key={index}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {table.columns.map((_column, colIndex) => (
                  <td key={colIndex}>{row[colIndex] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Ekran içindeki çözümlü örnek: önce kendin dene, sonra çözüm. */
function ExampleBlock({
  example,
  topicHint,
}: {
  example: Extract<LessonBlock, { type: "example" }>["example"];
  topicHint: string;
}) {
  const [shown, setShown] = useState(false);
  const stepTexts = (example.steps ?? []).filter((item) => !isPromptEcho(item, example.prompt));
  const solution = displaySolution(example.solution, example.prompt);
  return (
    <section className="als-example" aria-label="Çözümlü örnek">
      <p className="als-kicker">ÇÖZÜMLÜ ÖRNEK</p>
      {example.givens?.length ? (
        <>
          <h2 className="als-subhead">Verilenler</h2>
          <ul className="als-list">
            {example.givens.map((given) => (
              <li key={given}>
                <RichBody text={given} topicHint={topicHint} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="als-body">
          <RichBody text={example.prompt} topicHint={topicHint} />
        </p>
      )}
      {example.unknown ? (
        <>
          <h2 className="als-subhead">İstenen</h2>
          <p className="als-body">
            <RichBody text={example.unknown} topicHint={topicHint} />
          </p>
        </>
      ) : null}
      {shown ? (
        <div className="als-solution">
          <span className="als-tag">Çözüm</span>
          {stepTexts.length ? (
            <ol className="als-list">
              {stepTexts.map((item, stepIndex) => (
                <li key={item}>
                  {stepIndex + 1}. <RichBody text={item} topicHint={topicHint} />
                </li>
              ))}
            </ol>
          ) : solution ? (
            <BoardBody text={solution} className="als-solution-body" topicHint={topicHint} />
          ) : null}
          {example.result ? (
            <p>
              <strong>Sonuç: </strong>
              <RichBody text={example.result} topicHint={topicHint} />
            </p>
          ) : null}
        </div>
      ) : (
        <button type="button" className="als-secondary" onClick={() => setShown(true)}>
          Önce kendin dene, sonra sonucu göster
        </button>
      )}
    </section>
  );
}

/**
 * LessonV3 ekranının blokları, dizideki sırayla (16 Ekim 2026). Soru blokları
 * burada çizilmez; soru bölgesi ayrı (kontrol, açıklama, "Doğrusu").
 */
function LessonBlocks({
  blocks,
  source,
  topicHint,
  idBase,
}: {
  blocks: PlayBlock[];
  source?: { file: string; page?: number };
  topicHint: string;
  idBase: string;
}) {
  let sourceShown = !source;
  return (
    <>
      {blocks.map((block, blockIndex) => {
        const key = `${idBase}-${blockIndex}`;
        switch (block.type) {
          case "text": {
            const badge = sourceShown ? null : <SourceBadge source={source!} />;
            sourceShown = true;
            return (
              <Fragment key={key}>
                <BoardBody text={block.text} topicHint={topicHint} />
                {bodyHasRemovalNote(block.text) ? (
                  <p className="als-removed" role="status" title="Materyalinle doğrulanamayan kısımları göstermedik.">
                    <Info className="h-3.5 w-3.5" aria-hidden />
                    Doğrulanamayan cümleler çıkarıldı.
                  </p>
                ) : null}
                {badge}
              </Fragment>
            );
          }
          case "cards":
            return block.cards.length >= 2 ? (
              <div key={key} className="als-card-grid">
                {block.cards.map((card) => (
                  <article key={card.title} className="als-card">
                    <h2>{card.title}</h2>
                    <p>
                      <RichBody text={card.body} topicHint={topicHint} />
                    </p>
                  </article>
                ))}
              </div>
            ) : null;
          case "formula":
            return <FormulaCard key={key} formula={block.formula} />;
          case "procedure":
            return <ProcedureList key={key} procedure={block.procedure} />;
          case "table":
            return <ReferenceTable key={key} table={block.table} />;
          case "diagram":
            return <LessonDiagramView key={key} diagram={block.diagram} id={key} />;
          case "note":
            return (
              <aside key={key} className={`als-note als-note--${calloutTone(block.note)}`}>
                <p className="als-note-title">{block.note.title}</p>
                <p className="als-note-body">
                  <RichBody text={block.note.body} topicHint={topicHint} />
                </p>
              </aside>
            );
          case "example":
            return <ExampleBlock key={key} example={block.example} topicHint={topicHint} />;
          default:
            return null;
        }
      })}
    </>
  );
}

/** Ekran her iki biçimi de alır; içeride V3'e çevrilir (16 Ekim 2026, LessonV3). */
type PlayLesson = LessonV2 | z.infer<typeof publicLessonV2Schema> | LessonV3 | PublicLessonV3;
type PlayLessonV3 = LessonV3 | PublicLessonV3;
type PlayBlock = LessonBlock | PublicLessonBlock;
type PlayCheck = NonNullable<LessonV2["sections"][number]["check"]> | PublicSectionCheck;

function toPlayV3(lesson: PlayLesson): PlayLessonV3 {
  return isLessonV3(lesson) ? (lesson as PlayLessonV3) : v2ToV3(lesson as LessonV2);
}

/** Bloklar ilk sorudan bölünür: öncekiler sorudan önce, sonrakiler cevaptan sonra görünür. */
function splitAtCheck(blocks: PlayBlock[]): { before: PlayBlock[]; after: PlayBlock[] } {
  const at = blocks.findIndex((block) => block.type === "check");
  if (at < 0) return { before: blocks, after: [] };
  return {
    before: blocks.slice(0, at),
    after: blocks.slice(at + 1).filter((block) => block.type !== "check"),
  };
}

type Step =
  | { kind: "overview"; heading: string; body: string }
  | {
      kind: "section";
      heading: string;
      /** Metin bloklarının birleşimi (yardımcılar için); ekran blokları çizer. */
      body: string;
      /** Sıralı bloklar (soru dahil); ekranda bu sırayla görünür. */
      blocks: PlayBlock[];
      check?: PlayCheck;
      /** true: soru ekranın ilk bloğu — anlatım cevaptan sonra açılır ("önce dene"). */
      checkFirst?: boolean;
      source?: { file: string; page?: number };
      /** Kavram birden çok ekrana yayılıyorsa: "Z-skoru · 1/2". */
      part?: { concept: string; index: number; total: number };
      sectionIndex: number;
    }
  | {
      kind: "example";
      heading: string;
      prompt: string;
      solution: string;
      givens?: string[];
      unknown?: string;
      steps?: string[];
      result?: string;
    }
  | { kind: "recall"; heading: string; prompt: string; solution: string }
  | { kind: "mistake"; heading: string; claim: string; correction: string }
  | { kind: "summary"; heading: string; points: string[]; next: string[] }
  | { kind: "review-gate"; count: number; distinct: boolean }
  /** Parça parça açılan derste sıradaki kavram henüz denetimden çıkmadı. */
  | { kind: "building"; heading: string }
  | {
      kind: "retry";
      heading: string;
      check: PlayCheck;
      sectionIndex: number;
      variant: CheckGradeVariant;
    };

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

function checkKicker(type: string | undefined): string {
  if (type === "trueFalse") return "DOĞRU MU YANLIŞ MI?";
  if (type === "numerical") return "HESAP";
  if (type === "explain") return "KENDİ CÜMLELERİNLE";
  if (type === "findError") return "HATAYI BUL";
  return "HIZLI SINAV";
}

function bodyHasRemovalNote(text: string): boolean {
  return /Doğrulanamayan cümleler çıkarıldı/i.test(text);
}

function buildSteps(lesson: PlayLessonV3, view: LessonV2, building = false): Step[] {
  const steps: Step[] = [];
  const overview = (lesson.overview ?? "").trim();
  const firstBody = lesson.screens[0] ? screenText(lesson.screens[0]) : "";
  const groups = conceptGroups(lesson.screens);
  // Astra gibi giriş kartı (1 Ekim 2026): ders her zaman bir planla açılır —
  // okuma süresi, adım sayısı, kavramlar. Özet ilk ekranı tekrar ediyorsa
  // kanca cümlesi boş kalır, kart yine gösterilir.
  const hook = overview && !overviewDuplicatesSection(overview, firstBody) ? overview : "";
  // Ders yazılırken giriş kartı hep var: sonradan eklenip adımları kaydırmasın.
  if (hook || groups.length >= 2 || building) {
    steps.push({ kind: "overview", heading: lesson.title, body: hook });
  }
  steps.push(
    ...lesson.screens.map((screen, sectionIndex): Step => {
      const blocks = screen.blocks as PlayBlock[];
      const text = screenText(screen);
      // `source` alanı doldurulmuş üretimlerde zaten ayrı gelir; bundan önce
      // kaydedilmiş derslerde künye hâlâ ilk metnin sonunda gömülü olabilir —
      // ekranda göstermeden önce ayıklanır.
      let source = screen.source;
      let strippedFirst = false;
      const cleaned = blocks.flatMap((block): PlayBlock[] => {
        if (block.type === "text" && !strippedFirst && !source) {
          strippedFirst = true;
          const stripped = stripInlineSourceLine(block.text);
          if (stripped) {
            source = stripped.source ?? undefined;
            return stripped.body.trim() ? [{ ...block, text: stripped.body }] : [];
          }
          return [block];
        }
        // dropDuplicateNotes yalnızca eski üretimde çalışıyordu; o derslerde
        // metni tekrarlayan not hâlâ kayıtta durabilir — burada da ayıklanır.
        if (block.type === "note" && isNearDuplicateText(block.note.body, text)) return [];
        return [block];
      });
      const group = groups.find((item) => item.screens.includes(sectionIndex));
      const check = cleaned.find((block) => block.type === "check");
      return {
        kind: "section",
        heading: screen.heading,
        body: text,
        blocks: cleaned,
        check: check?.type === "check" ? (check.check as PlayCheck) : undefined,
        checkFirst: cleaned[0]?.type === "check",
        source,
        ...(group && group.screens.length > 1
          ? { part: { concept: group.concept, index: group.screens.indexOf(sectionIndex) + 1, total: group.screens.length } }
          : {}),
        sectionIndex,
      };
    }),
  );
  if (lesson.example?.prompt.trim()) {
    steps.push({
      kind: "example",
      heading: "Örnek",
      prompt: lesson.example.prompt,
      solution: lesson.example.solution,
      givens: lesson.example.givens,
      unknown: lesson.example.unknown,
      steps: lesson.example.steps,
      result: lesson.example.result,
    });
  }
  if (lesson.numericalCheck?.prompt.trim()) {
    const num = lesson.numericalCheck as {
      prompt: string;
      answer?: string;
      explanation?: string;
    };
    steps.push({
      kind: "section",
      heading: "Hesap",
      body: "Formülü ve verilenleri kullanarak hesapla.",
      blocks: [{ type: "text", text: "Formülü ve verilenleri kullanarak hesapla." }],
      check: {
        type: "numerical",
        prompt: num.prompt,
        answer: num.answer,
        explanation: num.explanation ?? "Hesabı verilenlerle kur.",
      },
      sectionIndex: -1,
    });
  }
  if (lesson.findError?.prompt.trim()) {
    const find = lesson.findError as {
      prompt: string;
      faultyText?: string;
      options: string[];
      answerIndex?: number;
      explanation?: string;
    };
    steps.push({
      kind: "section",
      heading: "Hatayı bul",
      body: find.faultyText ?? "",
      blocks: find.faultyText ? [{ type: "text", text: find.faultyText }] : [],
      check: {
        type: "findError",
        prompt: find.prompt,
        faultyText: find.faultyText,
        options: find.options,
        answerIndex: find.answerIndex,
        explanation: find.explanation ?? "Hatalı satırı seç.",
        lines: find.faultyText
          ?.split(/\n+/)
          .map((line) => line.trim())
          .filter(Boolean),
      },
      sectionIndex: -1,
    });
  }
  if (lesson.commonMistake?.claim.trim()) {
    steps.push({
      kind: "mistake",
      heading: "Sık yapılan hata",
      claim: lesson.commonMistake.claim,
      correction: lesson.commonMistake.correction,
    });
  }
  if (lesson.infoCheck?.prompt.trim()) {
    const answer =
      "answer" in lesson.infoCheck && typeof lesson.infoCheck.answer === "string"
        ? lesson.infoCheck.answer.trim()
        : "";
    if (answer) {
      const duplicated = view.sections.some(
        (section) => section.check?.prompt.trim() === lesson.infoCheck?.prompt.trim(),
      );
      if (!duplicated) {
        steps.push({
          kind: "recall",
          heading: "Bilgi kontrolü",
          prompt: lesson.infoCheck.prompt,
          solution: answer,
        });
      }
    }
  }
  if ((lesson.summary?.length ?? 0) > 0 || (lesson.nextFocus?.length ?? 0) > 0) {
    steps.push({
      kind: "summary",
      heading: lesson.summary?.length ? "Özet" : "Sırada ne var",
      points: lesson.summary ?? [],
      next: lesson.nextFocus ?? [],
    });
  }
  if (!steps.length) {
    steps.push({ kind: "overview", heading: lesson.title, body: view.sections[0]?.body ?? "" });
  }
  return steps;
}

/**
 * Giriş kartındaki "Bu derste neler var" listesi: kavramlar, tekrar etmeden.
 * İki-üç ekrana yayılan kavram bir kez yazılır; altındaki satır ilk ekranının.
 */
function LessonPlan({ lesson, upcoming = [], building = false }: { lesson: PlayLessonV3; upcoming?: string[]; building?: boolean }) {
  const groups = conceptGroups(lesson.screens).filter(
    (group, index, all) => all.findIndex((other) => other.concept === group.concept) === index,
  );
  // Yazımı süren kavramlar yalnız adlarıyla: denetlenmemiş satır gösterilmez.
  const pending = upcoming.filter((name) => !groups.some((group) => group.concept === name));
  if (groups.length + pending.length < 2) return null;
  const checks = lesson.screens.filter((screen) => screen.blocks.some((block) => block.type === "check")).length;
  return (
    <section className="als-intro-plan" aria-label="Bu derste neler var">
      <h2>Bu derste neler var</h2>
      <ol>
        {groups.map((group, index) => {
          const first = lesson.screens[group.screens[0]!];
          const line = first ? planLine({ lead: first.lead, body: screenText(first) }) : "";
          return (
            <li key={group.concept}>
              <span aria-hidden>{index + 1}</span>
              <div>
                {group.concept}
                {line ? <small>{line}</small> : null}
              </div>
            </li>
          );
        })}
        {pending.map((name, index) => (
          <li key={`pending-${name}`} className="als-intro-pending">
            <span aria-hidden>{groups.length + index + 1}</span>
            <div>{name}</div>
          </li>
        ))}
      </ol>
      {checks && !building ? (
        <p className="als-intro-end">
          {checks === 1 ? "Arada 1 kısa soru" : `Arada ${checks} kısa soru`}
          {lesson.summary?.length ? ", sonunda özet" : ""}
        </p>
      ) : null}
    </section>
  );
}

function progressLabel(
  index: number,
  lessonCount: number,
  step: Step,
  retryOrdinal = 0,
  retryTotal = 0,
): string {
  if (step.kind === "review-gate") return "Tekrar";
  if (step.kind === "retry") return `Tekrar ${retryOrdinal} / ${Math.max(1, retryTotal)}`;
  const total = Math.max(1, lessonCount);
  return `${Math.min(index + 1, total)} / ${total}`;
}

export function ExamLessonSteps({
  lesson,
  building = false,
  upcoming = [],
  language = "tr",
  onFinish,
  onClose,
  closeHref,
  gradeCheck,
  toolbar,
}: {
  lesson: PlayLesson;
  /** Parça parça açılan ders: sonraki kavramlar hâlâ yazılıyor (18 Ekim 2026). */
  building?: boolean;
  /** Yazımı süren kavramların adları. */
  upcoming?: string[];
  /** İlerleme çubuğunun altında duran küçük denetimler ("N kaynak"). */
  toolbar?: ReactNode;
  /** Hazırlığın dili. Tekrar sorusu bu dilde yeniden kurulur. */
  language?: MaterialLanguage;
  /** Kaçırılan bölüm indeksleri. Metin sunucuda dersin kendisinden kurulur. */
  onFinish?: (
    missedSectionIndexes?: number[],
    lessonAnswers?: Record<string, LessonCheckAnswer>,
    retryAnswers?: Record<string, LessonCheckAnswer>,
  ) => void;
  onClose?: () => void;
  closeHref?: string;
  /** Sunucu notlandırması. Yoksa (eski paket) istemci notlar. */
  gradeCheck?: (
    sectionIndex: number,
    answer: LessonCheckAnswer,
    variant?: CheckGradeVariant,
  ) => Promise<GradeCheckResult>;
}) {
  const play = useMemo(() => toPlayV3(lesson), [lesson]);
  /** V2 görünümü: tekrar soruları, okuma süresi ve eski yardımcılar bunu okur (ekran i = bölüm i). */
  const view = useMemo(() => v3ToV2(play as LessonV3), [play]);
  const base = useMemo(() => buildSteps(play, view, building), [play, view, building]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [solutionShown, setSolutionShown] = useState(false);
  const [written, setWritten] = useState("");
  const [recallDraft, setRecallDraft] = useState("");
  const [grading, setGrading] = useState(false);
  const [gradeResult, setGradeResult] = useState<GradeCheckResult | null>(null);
  /** Yanlış cevaplanan bölümlerin sırası — tekrar kuyruğunu bunlar doğurur. */
  const [missed, setMissed] = useState<number[]>([]);
  const [lessonAnswers, setLessonAnswers] = useState<Record<string, LessonCheckAnswer>>({});
  const [retryAnswers, setRetryAnswers] = useState<Record<string, LessonCheckAnswer>>({});
  /** grade-check primary yanıtındaki sealed retry — paket önceden taşımaz. */
  const [serverRetries, setServerRetries] = useState<Record<string, PublicSectionCheck>>({});
  const [ungradable, setUngradable] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const closeDialogRef = useRef<HTMLDivElement | null>(null);
  const mathTopicHint = play.title ?? "";

  const steps = useMemo(() => {
    // Yazım sürerken son adım bekleme kartı; tekrar kuyruğu ders bitince gelir.
    if (building) return [...base, { kind: "building", heading: upcoming[0] ?? "Sıradaki bölüm" } as Step];
    const retries = missed
      .map((sectionIndex) => {
        const section = view.sections[sectionIndex] as
          | (LessonV2["sections"][number] & { retryCheck?: PublicSectionCheck })
          | undefined;
        if (!section?.check) return null;
        // Sunucunun primary notlandırmada verdiği sealed retry.
        // Eski paket: lesson.retryCheck veya istemcide answerIndex ile legacy.
        const fromServer = serverRetries[String(sectionIndex)];
        const fromLegacyPayload = section.retryCheck;
        const legacyClient =
          !fromServer &&
          !fromLegacyPayload &&
          typeof (section.check as { answerIndex?: number }).answerIndex === "number"
            ? reviewGateQuestion(
                section.check as NonNullable<LessonV2["sections"][number]["check"]>,
                language,
                section.body,
              )
            : null;
        const retryCheck = fromServer ?? fromLegacyPayload ?? legacyClient ?? section.check;
        // Sunucu varyantı yoksa (eski istemci yolu) primary ile notlanır.
        const variant: CheckGradeVariant =
          fromServer || fromLegacyPayload || legacyClient ? "retry" : "primary";
        return {
          kind: "retry" as const,
          heading: section.heading,
          check: retryCheck,
          sectionIndex,
          variant,
        } satisfies Step;
      })
      .filter((s): s is Extract<Step, { kind: "retry" }> => s !== null);
    if (!retries.length) return base;
    const distinct = retries.some((retry) => {
      const primary = view.sections[retry.sectionIndex]?.check;
      if (!primary) return false;
      return isDistinctRetryVariant(primary, retry.check);
    });
    return [
      ...base,
      { kind: "review-gate", count: retries.length, distinct } as Step,
      ...retries,
    ];
  }, [base, missed, view, language, serverRetries, building, upcoming]);

  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;
  const check =
    step.kind === "section" ? step.check : step.kind === "retry" ? step.check : undefined;
  const mustAnswer = Boolean(check) && !revealed;
  const presentation = check ? checkPresentation(check) : null;
  const tf = check && presentation === "trueFalse" ? trueFalseIndexes(check.options ?? []) : null;
  const answerIndex =
    gradeResult?.answerIndex ??
    ("answerIndex" in (check ?? {}) ? (check as { answerIndex?: number }).answerIndex : undefined);
  const correct = Boolean(
    check &&
      revealed &&
      !ungradable &&
      (gradeResult
        ? gradeResult.correct || gradeResult.half
        : picked != null && answerIndex != null && picked === answerIndex),
  );
  const hasVerdict = Boolean(check && revealed && !ungradable && (gradeResult || answerIndex != null));

  function resetAnswer() {
    setPicked(null);
    setRevealed(false);
    setSolutionShown(false);
    setWritten("");
    setRecallDraft("");
    setGradeResult(null);
    setGrading(false);
    setUngradable(false);
  }

  function go(nextIndex: number) {
    setIndex(nextIndex);
    resetAnswer();
  }

  function next() {
    // Bekleme kartında ilerlenmez: sıradaki kavram gelince kart onun yerini alır.
    if (step.kind === "building") return;
    if (last) {
      onFinish?.(missed, lessonAnswers, retryAnswers);
      return;
    }
    go(index + 1);
  }

  function back() {
    if (index > 0) {
      go(index - 1);
      return;
    }
    setCloseConfirmOpen(true);
  }

  function requestClose() {
    setCloseConfirmOpen(true);
  }

  function confirmClose() {
    setCloseConfirmOpen(false);
    if (onClose) {
      onClose();
      return;
    }
    if (closeHref && typeof window !== "undefined") {
      window.location.assign(closeHref);
    }
  }

  useEffect(() => {
    if (!closeConfirmOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = closeDialogRef.current;
    const focusable = dialog?.querySelector<HTMLElement>("button.als-cta, button");
    focusable?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setCloseConfirmOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [closeConfirmOpen]);

  function markMissed(sectionIndex: number) {
    if (sectionIndex < 0 || missed.includes(sectionIndex)) return;
    setMissed((prev) => [...prev, sectionIndex]);
  }

  async function submitCheck(answer: LessonCheckAnswer) {
    if (!check || revealed || grading) return;
    const sectionIndex =
      step.kind === "section"
        ? step.sectionIndex
        : step.kind === "retry"
          ? step.sectionIndex
          : -1;
    const variant: CheckGradeVariant =
      step.kind === "retry" ? step.variant : "primary";
    if (step.kind === "section" && sectionIndex >= 0) {
      setLessonAnswers((prev) => ({ ...prev, [String(sectionIndex)]: answer }));
    }
    if (step.kind === "retry" && sectionIndex >= 0) {
      setRetryAnswers((prev) => ({ ...prev, [String(sectionIndex)]: answer }));
    }

    const hasClientAnswer =
      typeof (check as { answerIndex?: number }).answerIndex === "number" ||
      typeof (check as { answer?: string }).answer === "string" ||
      Boolean((check as { expectedPoints?: string[] }).expectedPoints?.length);

    // Sunucu yolu: hem bölüm hem tekrar. Sızdırılmış pakette answerIndex yok.
    if (gradeCheck && sectionIndex >= 0) {
      setGrading(true);
      try {
        const result = await gradeCheck(sectionIndex, answer, variant);
        setGradeResult(result);
        setRevealed(true);
        if (typeof answer.pick === "number") setPicked(answer.pick);
        if (result.retryCheck && step.kind === "section") {
          setServerRetries((prev) => ({ ...prev, [String(sectionIndex)]: result.retryCheck! }));
        }
        // İlk deneme yanlışsa kuyruğa al; doğru tekrar yeniden kuyruğa almaz.
        if (step.kind === "section" && !result.correct && !result.half) {
          markMissed(sectionIndex);
        }
      } catch {
        setUngradable(true);
        setGradeResult({ correct: false, message: "Notlandırılamadı. Yeniden dene." });
        setRevealed(true);
        if (typeof answer.pick === "number") setPicked(answer.pick);
      } finally {
        setGrading(false);
      }
      return;
    }

    // Sızdırılmış paket + gradeCheck yok: asla varsayılan Yanlış gösterme.
    if (!hasClientAnswer) {
      setUngradable(true);
      setGradeResult({ correct: false, message: "Notlandırılamadı. Yeniden dene." });
      setRevealed(true);
      if (typeof answer.pick === "number") setPicked(answer.pick);
      return;
    }

    // Eski paket: cevap istemcide.
    if (typeof answer.pick === "number") {
      setPicked(answer.pick);
      setRevealed(true);
      if (
        step.kind === "section" &&
        answer.pick !== (check as { answerIndex?: number }).answerIndex
      ) {
        markMissed(step.sectionIndex);
      }
      return;
    }

    if (check.type === "numerical") {
      const expected = (check as { answer?: string }).answer ?? "";
      const got = (answer.text ?? "").replace(/\s+/g, "").replace(",", ".").toLocaleLowerCase("tr-TR");
      const want = expected.replace(/\s+/g, "").replace(",", ".").toLocaleLowerCase("tr-TR");
      setRevealed(true);
      const ok = Boolean(got === want || (got && want.startsWith(got)));
      setGradeResult({
        correct: ok,
        answer: expected,
        explanation: check.explanation,
        message: ok ? `Doğru — ${expected}` : `Doğrusu ${expected}`,
      });
      if (!ok && step.kind === "section") markMissed(step.sectionIndex);
      return;
    }

    setRevealed(true);
    setGradeResult({
      correct: (answer.text ?? "").trim().length >= 10,
      expectedPoints: (check as { expectedPoints?: string[] }).expectedPoints,
      explanation: check.explanation,
    });
    if ((answer.text ?? "").trim().length < 10 && step.kind === "section") {
      markMissed(step.sectionIndex);
    }
  }

  function pick(optionIndex: number) {
    void submitCheck({ pick: optionIndex });
  }

  const closeControl =
    onClose || closeHref ? (
      <button type="button" className="als-icon" onClick={requestClose} aria-label="Dersi kapat">
        <X className="h-4 w-4" />
      </button>
    ) : null;

  return (
    <article className="als">
      <header className="als-top">
        {index > 0 || onClose ? (
          <button type="button" className="als-icon" onClick={back} aria-label="Geri">
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : closeHref ? (
          <button type="button" className="als-icon" onClick={requestClose} aria-label="Geri">
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : (
          <span className="als-icon als-icon--ghost" aria-hidden />
        )}
        <div
          className="als-segments"
          role="progressbar"
          aria-valuenow={Math.min(index + 1, base.length)}
          aria-valuemin={1}
          aria-valuemax={Math.max(1, base.length)}
          aria-label="Ders ilerlemesi"
        >
          {base.map((_, segment) => (
            <span
              key={segment}
              className={segment <= Math.min(index, base.length - 1) ? "is-on" : undefined}
            />
          ))}
        </div>
        <p className="als-count" aria-live="polite">
          <span>
            {progressLabel(
              index,
              base.length,
              step,
              index - base.length,
              Math.max(0, steps.length - base.length - 1),
            )}
          </span>
          <span className="als-minutes">yaklaşık {honestReadingMinutes(view)} dk</span>
        </p>
        {closeControl ?? <span className="als-icon als-icon--ghost" aria-hidden />}
      </header>
      {toolbar ? <div className="als-toolbar">{toolbar}</div> : null}

      {closeConfirmOpen ? (
        <div
          className="als-dialog-backdrop"
          role="presentation"
          onClick={() => setCloseConfirmOpen(false)}
        >
          <div
            ref={closeDialogRef}
            className="als-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="als-close-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="als-close-title">Dersten çıkmak istiyor musun?</h2>
            <p>İlerlemen kaydedildi, kaldığın yerden devam edebilirsin.</p>
            <div className="als-dialog-actions">
              <button type="button" className="als-cta" onClick={() => setCloseConfirmOpen(false)}>
                Derse dön
              </button>
              <button type="button" className="als-secondary als-secondary--danger" onClick={confirmClose}>
                Çık
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {(() => {
        // checkFirst: soru gövdeden önce gösterilir (geri getirme / "önce
        // dene"). Görsel bir CSS ters çevirme (column-reverse) yerine gerçek
        // DOM sırası değişiyor — ekran okuyucu da soruyu önce duysun diye.
        const checkFirst = step.kind === "section" && Boolean(step.checkFirst);
        const slideRegion = (
          <>
      {step.kind === "review-gate" ? (
        <div className="als-slide">
          <p className="als-kicker">TEKRARLA</p>
          <h1 className="als-heading">Bitirmeden önce kısa tekrar</h1>
          <p className="als-body">{reviewGateLead(step.count, { distinct: step.distinct })}</p>
        </div>
      ) : null}

      {step.kind === "building" ? (
        <div className="als-slide als-building" role="status" aria-live="polite">
          <p className="als-kicker">HAZIRLANIYOR</p>
          <h1 className="als-heading">{step.heading}</h1>
          <p className="als-body">Öğretmenin bu bölümü yazıyor ve denetliyor. Birkaç saniye içinde burada olacak.</p>
          <span className="als-building-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        </div>
      ) : null}

      {step.kind === "retry" ? <p className="als-kicker">TEKRARLA</p> : null}

      {step.kind !== "review-gate" && step.kind !== "building" ? (
        <div className={step.kind === "overview" || step.kind === "section" ? "als-slide" : undefined}>
          {step.kind === "overview" ? (
            <p className="als-intro-meta">
              <span className="als-intro-tag">Ders</span>
              yaklaşık {honestReadingMinutes(view)} dk okuma{building ? "" : ` · ${base.length} adım`}
            </p>
          ) : null}
          {step.kind === "section" && step.part ? (
            <p className="als-kicker als-part">
              {step.part.concept} · {step.part.index}/{step.part.total}
            </p>
          ) : null}
          <h1 className="als-heading">{step.heading}</h1>

          {step.kind === "overview" ? (
            <>
              {step.body ? <BoardBody text={step.body} topicHint={mathTopicHint} /> : null}
              <LessonPlan lesson={play} upcoming={upcoming} building={building} />
            </>
          ) : null}

          {/* LessonV3: bloklar dizideki sırayla. "Önce dene"de sorudan sonrakiler, değilse sorudan öncekiler. */}
          {step.kind === "section" ? (
            <LessonBlocks
              blocks={step.checkFirst ? splitAtCheck(step.blocks).after : splitAtCheck(step.blocks).before}
              source={step.source}
              topicHint={mathTopicHint}
              idBase={`als-d-${index}`}
            />
          ) : null}

          {step.kind === "example" ? (
            <>
              {step.givens?.length ? (
                <>
                  <h2 className="als-subhead">Verilenler</h2>
                  <ul className="als-list">
                    {step.givens.map((given) => (
                      <li key={given}>
                        <RichBody text={given}  topicHint={mathTopicHint} />
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="als-body">
                  <RichBody text={step.prompt}  topicHint={mathTopicHint} />
                </p>
              )}
              {step.unknown ? (
                <>
                  <h2 className="als-subhead">İstenen</h2>
                  <p className="als-body">
                    <RichBody text={step.unknown}  topicHint={mathTopicHint} />
                  </p>
                </>
              ) : null}
              {solutionShown ? (
                (() => {
                  const stepTexts = (step.steps ?? []).filter(
                    (item) => !isPromptEcho(item, step.prompt),
                  );
                  const shown = displaySolution(step.solution, step.prompt);
                  if (!shown && !stepTexts.length && !step.result) {
                    return (
                      <p className="text-sm text-[var(--cp-muted)]">
                        Bu örnek için ayrı bir çözüm metni yok.
                      </p>
                    );
                  }
                  return (
                    <div className="als-solution">
                      <span className="als-tag">Çözüm</span>
                      {stepTexts.length ? (
                        <ol className="als-list">
                          {stepTexts.map((item, stepIndex) => (
                            <li key={item}>
                              {stepIndex + 1}. <RichBody text={item}  topicHint={mathTopicHint} />
                            </li>
                          ))}
                        </ol>
                      ) : shown ? (
                        <BoardBody text={shown} className="als-solution-body"  topicHint={mathTopicHint} />
                      ) : null}
                      {step.result ? (
                        <p>
                          <strong>Sonuç: </strong>
                          <RichBody text={step.result}  topicHint={mathTopicHint} />
                        </p>
                      ) : null}
                    </div>
                  );
                })()
              ) : (
                <button
                  type="button"
                  className="als-secondary"
                  onClick={() => setSolutionShown(true)}
                >
                  Önce kendin dene, sonra sonucu göster
                </button>
              )}
            </>
          ) : null}

          {step.kind === "recall" ? (
            <div className="als-recall">
              <p className="als-body">
                <RichBody text={step.prompt}  topicHint={mathTopicHint} />
              </p>
              <label className="als-recall-label" htmlFor={`als-recall-${index}`}>
                Önce kendin yaz
              </label>
              <textarea
                id={`als-recall-${index}`}
                className="als-recall-input"
                value={recallDraft}
                placeholder="Cevabını düşün, sonra çözümü aç."
                onChange={(event) => setRecallDraft(event.target.value)}
              />
              {solutionShown ? (
                <div className="als-solution">
                  <span className="als-tag">Çözüm</span>
                  <BoardBody text={step.solution} className="als-solution-body"  topicHint={mathTopicHint} />
                </div>
              ) : (
                <button
                  type="button"
                  className="als-secondary"
                  onClick={() => setSolutionShown(true)}
                >
                  Çözümü göster
                </button>
              )}
            </div>
          ) : null}

          {step.kind === "mistake" ? (
            <div className="als-mistake">
              <p className="als-mistake-claim">
                <span className="als-tag als-tag--warn">Yanlış</span>
                <RichBody text={step.claim}  topicHint={mathTopicHint} />
              </p>
              <p className="als-mistake-fix">
                <span className="als-tag als-tag--ok">Doğrusu</span>
                <RichBody text={step.correction}  topicHint={mathTopicHint} />
              </p>
            </div>
          ) : null}

          {step.kind === "summary" ? (
            <>
              {step.points.length ? (
                <ul className="als-list">
                  {step.points.map((point) => (
                    <li key={point}>
                      <RichBody text={point}  topicHint={mathTopicHint} />
                    </li>
                  ))}
                </ul>
              ) : null}
              {step.next.length ? (
                <>
                  {step.points.length ? <h2 className="als-subhead">Sırada ne var</h2> : null}
                  <ul className="als-list als-list--muted">
                    {step.next.map((item) => (
                      <li key={item}>
                        <RichBody text={item}  topicHint={mathTopicHint} />
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
          </>
        );
        const checkRegion = (
          <>
      {check && (check.type === "numerical" || check.type === "explain") ? (
        <section className="als-check" aria-label="Bölüm kontrolü">
          <p className="als-kicker">{checkKicker(check.type)}</p>
          <p className="als-check-prompt">{check.prompt}</p>
          <form
            className="als-options"
            onSubmit={(event) => {
              event.preventDefault();
              if (!written.trim() || grading) return;
              void submitCheck({ text: written });
            }}
          >
            {check.type === "numerical" ? (
              <>
                <input
                  className="als-write"
                  value={written}
                  onChange={(event) => setWritten(event.target.value)}
                  disabled={revealed || grading}
                  inputMode="decimal"
                  aria-label="Sayısal yanıt"
                  // "ör. 13,6 g" matematik sorusunda birim istiyormuş gibi okunuyordu.
                  placeholder="Sonucu yaz (birimi varsa ekle)"
                />
                <p className="als-hint">Virgül ya da nokta kullanabilirsin.</p>
              </>
            ) : (
              <textarea
                className="als-write"
                value={written}
                onChange={(event) => setWritten(event.target.value)}
                disabled={revealed || grading}
                rows={3}
                aria-label="Kendi cümlen"
                placeholder="Kendi cümlelerinle 2–3 cümlede açıkla…"
              />
            )}
            {!revealed ? (
              <button
                type="submit"
                className="als-cta als-cta--inline"
                disabled={written.trim().length < (check.type === "explain" ? 10 : 1) || grading}
                aria-busy={grading}
              >
                {grading ? "Kontrol ediliyor…" : "Yanıtı kontrol et"}
              </button>
            ) : null}
          </form>
          {revealed ? (
            <div className="als-explain" role="status">
              {check.type === "numerical" ? (
                <p>
                  <strong>{gradeResult?.message ?? (gradeResult?.correct ? "Doğru." : "Doğrusu şu:")}</strong>{" "}
                  {(() => {
                    // Sunucu mesajı cevabı zaten taşıyor ("Doğru — 64"); ekran
                    // "64 64" diye ikinci kez yazıyordu.
                    const answer = gradeResult?.answer ?? (check as { answer?: string }).answer ?? "";
                    return answer && !(gradeResult?.message ?? "").includes(answer) ? `${answer} ` : "";
                  })()}
                  {gradeResult?.explanation ?? check.explanation}
                </p>
              ) : (
                <>
                  <strong>{gradeResult?.message ?? "Beklenen noktalar"}</strong>
                  <ul className="als-list">
                    {(gradeResult?.expectedPoints ??
                      (check as { expectedPoints?: string[] }).expectedPoints ??
                      [gradeResult?.explanation ?? check.explanation ?? ""]).map((point, pointIndex) => (
                      <li key={point}>
                        {gradeResult?.pointMatches?.[pointIndex] === false ? "✗ " : "✓ "}
                        {point}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {check && check.type !== "numerical" && check.type !== "explain" && presentation === "trueFalse" ? (
        <section
          className={[
            "als-check",
            revealed ? (correct ? "is-right" : "is-wrong") : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label="Doğru mu yanlış mı"
        >
          <p className="als-kicker">{checkKicker(check.type)}</p>
          <p className="als-check-prompt">
            <RichBody text={check.prompt}  topicHint={mathTopicHint} />
          </p>
          {!revealed ? (
            <div className="als-tf">
              {tf ? (
                <>
                  <button type="button" className="als-tf-btn" onClick={() => pick(tf.wrong)} disabled={grading}>
                    👈 Yanlış
                  </button>
                  <button type="button" className="als-tf-btn" onClick={() => pick(tf.right)} disabled={grading}>
                    Doğru 👉
                  </button>
                </>
              ) : (
                (check.options ?? []).map((option, optionIndex) => (
                  <button
                    key={option}
                    type="button"
                    className="als-tf-btn"
                    disabled={grading}
                    onClick={() => pick(optionIndex)}
                  >
                    {option}
                  </button>
                ))
              )}
            </div>
          ) : null}
          {revealed ? (
            <Explanation
              check={check}
              picked={picked}
              revisit={step.kind === "section"}
              gradeResult={gradeResult}
              topicHint={mathTopicHint}
            />
          ) : null}
        </section>
      ) : null}

      {check && check.type !== "numerical" && check.type !== "explain" && presentation === "quickQuiz" ? (
        <section className="als-check" aria-label="Hızlı sınav">
          <p className="als-kicker">{checkKicker(check.type)}</p>
          <p className="als-check-prompt">
            <RichBody text={check.prompt}  topicHint={mathTopicHint} />
          </p>
          <div className="als-options" role={check.type === "findError" ? "radiogroup" : undefined}>
            {(
              check.type === "findError" && "lines" in check && Array.isArray(check.lines) && check.lines.length
                ? check.lines
                : (check.options ?? [])
            ).map((option, optionIndex) => {
              const isAnswer = answerIndex != null && optionIndex === answerIndex;
              const isPicked = picked === optionIndex;
              const state = !revealed
                ? isPicked
                  ? "is-picked"
                  : undefined
                : isAnswer
                  ? "is-right"
                  : isPicked
                    ? "is-wrong"
                    : undefined;
              return (
                <button
                  key={`${option}-${optionIndex}`}
                  type="button"
                  className={["als-option", state].filter(Boolean).join(" ")}
                  disabled={revealed || grading}
                  aria-pressed={isPicked}
                  onClick={() => pick(optionIndex)}
                >
                  <span className="als-option-num" aria-hidden>
                    {OPTION_LETTERS[optionIndex] ?? optionIndex + 1}
                  </span>
                  <span>
                    <RichBody text={option}  topicHint={mathTopicHint} />
                  </span>
                  {revealed && isAnswer ? (
                    <Check className="h-4 w-4 shrink-0" aria-hidden />
                  ) : revealed && isPicked && !isAnswer ? (
                    <X className="h-4 w-4 shrink-0" aria-hidden />
                  ) : (
                    <span className="als-radio" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
          {revealed ? (
            <Explanation
              check={check}
              picked={picked}
              revisit={step.kind === "section"}
              gradeResult={gradeResult}
              topicHint={mathTopicHint}
            />
          ) : null}
        </section>
      ) : null}
          </>
        );
        // "Önce dene"de anlatım cevaptan sonra açılır. 16 Ekim 2026'ya kadar ikisi
        // birlikte görünüyordu: gövde sorunun hemen altında cevabı veriyordu.
        return (
          <div className="als-step-content">
            {checkFirst ? checkRegion : slideRegion}
            {checkFirst ? (revealed ? slideRegion : null) : checkRegion}
            {/* Sorunun ortada durduğu ekranda sonrası cevaptan sonra açılır. */}
            {!checkFirst && step.kind === "section" && revealed && splitAtCheck(step.blocks).after.length ? (
              <div className="als-slide als-slide--after">
                <LessonBlocks
                  blocks={splitAtCheck(step.blocks).after}
                  topicHint={mathTopicHint}
                  idBase={`als-d-${index}-after`}
                />
              </div>
            ) : null}
          </div>
        );
      })()}

      {revealed && check && ungradable ? (
        <div className="als-feedback" role="status">
          <span>{gradeResult?.message ?? "Notlandırılamadı. Yeniden dene."}</span>
          <button type="button" className="als-cta als-cta--inline" onClick={next}>
            Devam et <CornerDownLeft className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : revealed && check && hasVerdict ? (
        <div className={correct ? "als-feedback is-right" : "als-feedback is-wrong"} role="status">
          <span>{correct ? "🎉 Doğru" : "🤔 Yanlış"}</span>
          <button type="button" className="als-cta als-cta--inline" onClick={next}>
            Devam et <CornerDownLeft className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : mustAnswer || step.kind === "building" ? null : (
        <button type="button" className="als-cta" onClick={next}>
          {step.kind === "review-gate" ? "Başla" : last ? "Dersi bitir" : "Devam et"}
          <CornerDownLeft className="h-4 w-4" aria-hidden />
        </button>
      )}

      {last && "qualityReport" in lesson && Array.isArray(lesson.qualityReport) && lesson.qualityReport.length ? (
        <details className="als-quality">
          <summary>Kalite raporu (yalnız kurucu)</summary>
          <ul>
            {lesson.qualityReport.map((entry) => (
              <li key={`${entry.rule}-${entry.excerpt}`}>
                <strong>{entry.rule}</strong> — {entry.excerpt}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

function Explanation({
  check,
  picked,
  revisit,
  gradeResult,
  topicHint = "",
}: {
  check: PlayCheck;
  picked: number | null;
  revisit: boolean;
  gradeResult?: GradeCheckResult | null;
  topicHint?: string;
}) {
  const answerIndex =
    gradeResult?.answerIndex ??
    ("answerIndex" in check ? check.answerIndex : undefined);
  const wrong = picked != null && answerIndex != null ? picked !== answerIndex : !gradeResult?.correct;
  const whyRight = (gradeResult?.whyRight ?? ("whyRight" in check ? check.whyRight : undefined))?.trim() ?? "";
  const whyWrong = (gradeResult?.whyWrong ?? ("whyWrong" in check ? check.whyWrong : undefined))?.trim() ?? "";
  const optionWhy = gradeResult?.optionWhy ?? ("optionWhy" in check ? check.optionWhy : undefined) ?? [];
  const pickedWhy = picked != null ? optionWhy[picked]?.trim() ?? "" : "";
  const answerWhy = answerIndex != null ? optionWhy[answerIndex]?.trim() ?? "" : "";
  const explanation =
    gradeResult?.explanation ?? ("explanation" in check ? check.explanation : undefined) ?? "";
  const misconception =
    gradeResult?.misconception ?? ("misconception" in check ? check.misconception : undefined);
  const hint = gradeResult?.hint ?? ("hint" in check ? check.hint : undefined);
  const corrected =
    check.type === "trueFalse"
      ? (gradeResult?.corrected ?? ("corrected" in check ? check.corrected : undefined))?.trim() ?? ""
      : "";
  const structured = Boolean(whyRight || whyWrong || misconception || hint || optionWhy.length);
  const options = check.options ?? ("lines" in check ? check.lines : undefined) ?? [];
  const wrongBody = (pickedWhy || whyWrong || explanation).trim();
  const rightBody = (answerWhy || (structured && whyRight ? whyRight : explanation)).trim();
  const body = wrong ? wrongBody : rightBody;
  // Boş AÇIKLAMA kutusu gösterme (28 Eyl olayı).
  if (!body && !corrected && !misconception?.trim() && !hint?.trim() && !(wrong && optionWhy.length > 1)) {
    return wrong && revisit ? (
      <div className="als-explain" aria-live="polite">
        <p className="als-revisit">Dersin sonunda buna geri döneceğiz.</p>
      </div>
    ) : null;
  }
  return (
    <div className="als-explain" aria-live="polite">
      <p className="als-explain-kicker">AÇIKLAMA</p>
      {wrong ? (
        <>
          {wrongBody ? (
            <p>
              <RichBody text={wrongBody} topicHint={topicHint} />
            </p>
          ) : null}
          {optionWhy.length > 1
            ? options.map((option, optionIndex) => {
                if (optionIndex === answerIndex || optionIndex === picked) return null;
                const reason = optionWhy[optionIndex]?.trim();
                if (!reason) return null;
                return (
                  <p key={option}>
                    <span className="als-tag">
                      {OPTION_LETTERS[optionIndex] ?? optionIndex + 1} · {option}
                    </span>{" "}
                    {reason}
                  </p>
                );
              })
            : null}
          {misconception?.trim() ? (
            <p>
              <span className="als-tag als-tag--warn">Yanılgı</span> {misconception.trim()}
            </p>
          ) : null}
          {hint?.trim() ? (
            <p>
              <span className="als-tag">İpucu</span> {hint.trim()}
            </p>
          ) : null}
        </>
      ) : rightBody ? (
        <p>
          <RichBody text={rightBody} topicHint={topicHint} />
        </p>
      ) : null}
      {corrected ? (
        <p>
          <span className="als-tag als-tag--ok">Doğrusu</span> {corrected}
        </p>
      ) : null}
      {wrong && revisit ? (
        <p className="als-revisit">Dersin sonunda buna geri döneceğiz.</p>
      ) : null}
    </div>
  );
}
