import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { openaiClient } from "@/lib/ai/openai-client";
import { env, type ActionCode } from "@/lib/env";
import { contentModel } from "@/lib/ai/model-router";
import { withGenerationSlot } from "@/lib/ai/generation-slots";
import { fastAllowedFor } from "@/lib/learning/fast-access";
import { studentPedagogyBlock, withStudentProfile } from "@/lib/learning/student-pedagogy";
import { commitCredits, recordUsage, refundCredits, refusalCode, reserveCredits } from "@/lib/credits/service";
import type { FreeMeter } from "@/lib/billing/free-meters";
import { parseModelJson } from "@/lib/learning/teaching-standards";
import { LESSON_V3_FORMAT, screenConcept, type LessonScreen, type LessonV3 } from "@/lib/learning/lesson-v3";
import { LessonStreamReader } from "@/lib/learning/lesson-stream";
import { runLessonSanity } from "@/lib/learning/lesson-sanity";
import {
  COVERAGE_COMPLETION_SCREENS,
  DIAGRAM_COMPLETION_SYSTEM,
  coverageCompletionUserPrompt,
  coverageGapCount,
  dedupScreens,
  diagramCompletionUserPrompt,
  dropRepeatedChecks,
  dropRepeatedScreens,
  fourPartGaps,
  isCoverageIssue,
  lessonCoverageGaps,
  lessonLevelStructureIssues,
  lessonTeachingFlags,
  parametricDiagramIssue,
  parseDiagramCompletion,
  parseTeacherLesson,
  parseTeacherScreen,
  settleCheckKeys,
  shuffleLessonChecks,
  stripLessonIssueTags,
  teacherSystem,
  teacherUserPrompt,
  type DiagramCompletion,
  type LessonCoverageGaps,
  type TeacherIssue,
  type TeacherLessonInput,
} from "@/lib/learning/teacher-lesson";

/*
  Öğretmen ders motoru, akışlı (18 Ekim 2026, ürün sahibinin kararı: "ders ~10 sn'de açılsın,
  kaliteden ödün verilmesin").

  17 Ekim canlı ölçümü: taslak 43 sn + denetim 22 sn + iki düzeltme turu (her biri dersin
  TAMAMINI baştan yazıyordu) 35+22, 35+30 sn → ~4 dk ve tek bir eşik itirazıyla ders atıldı.

  Yeni yol (26 Ekim 2026, tek geçiş):
  - Yazar dersi bir kez, akışla yazar. Denetçi, düzeltme ve dersi baştan yazma turu yok.
  - Ayrışan her kavram yayımlanır. Kavram atılmaz, öğrenciye eksik bölüm cümlesi yazılmaz.
  - JSON ekran ekran akmazsa aynı metin bir kez daha ayrıştırılır.
  - Dört parçadan biri eksikse bir tamamlama çağrısı yapılır; tutmazsa ilk taslak kalır.
  - Kapsam açığı kalırsa (omurga başlığı, kilit bilgi) yalnız eksikleri öğreten en çok iki ekran isteyen tek küçük
    çağrı (30 Ekim 2026, 30 sn tavan); açık azalmazsa ders aynen yayımlanır.
  - diagram_card yoksa yalnız kartı isteyen tek küçük çağrı (29 Ekim 2026, 25 sn tavan); kart derste ya da
    kaynakta geçen etiket ve sayılarla temellenmezse ders aynen yayımlanır.
  - Yayımdan önce anahtar kapısı (29 Ekim 2026, model çağrısız): açıklamanın şıkkıyla çelişen answerIndex hizalanır,
    ekranda olmayan görsele gönderen soru çıkar (`settleCheckKeys`).
  - Öğrenci beklerken hızlı işlem (ürün sahibinin kararı: önce yalnız Plus, aynı gün herkese).
  Kod ders metnine hiçbir şey eklemez.
*/

/** Şema tamamlama çağrısının tavanı: soğuk derse en çok bu kadar eklenir. */
const DIAGRAM_COMPLETION_MS = 25_000;

/** Tamamlama geç dönerse ya da düşerse null. */
function withDeadline<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

/**
 * diagram_card eksikse tek küçük çağrıyla kartı ister (aynı LessonIo; akış önemsiz). Ayrıştırma ve temellendirme
 * koddadır; geçerse kart `afterConcept` kavramının son ekranına girer, düşerse ya da zaman aşarsa ders aynen kalır.
 */
export async function completeLessonDiagram(io: LessonIo, lesson: LessonV3, input: TeacherLessonInput): Promise<DiagramCompletion> {
  const started = Date.now();
  let verdict: DiagramCompletion;
  try {
    const answer = await withDeadline(
      io.write(DIAGRAM_COMPLETION_SYSTEM, diagramCompletionUserPrompt(lesson, input), () => undefined),
      DIAGRAM_COMPLETION_MS,
    );
    verdict = answer ? parseDiagramCompletion(parseModelJson(answer.text), lesson, input) : { verdict: "timeout", lesson: null };
  } catch {
    verdict = { verdict: "error", lesson: null };
  }
  console.info("teacher_lesson_diagram", {
    verdict: verdict.verdict,
    kind: verdict.kind ?? null,
    concept: verdict.concept?.slice(0, 60) ?? null,
    ms: Date.now() - started,
  });
  return verdict;
}

/** Kapsam tamamlama çağrısının tavanı: yalnız eksik kısımları öğreten en çok iki ekran. */
const COVERAGE_COMPLETION_MS = 30_000;

export type CoverageCompletion = {
  verdict: "added" | "no_gain" | "unparsed" | "timeout" | "error";
  /** Eklenen ekranlar (yalnız `added`). Anahtar hizalı, tekrar düşmüş, şıkları karışık. */
  screens: LessonScreen[];
  before: number;
  after: number;
};

/**
 * Ders bitince kalan kapsam açıkları için tek küçük çağrı (30 Ekim 2026). Yazar aynı sistem istemiyle yalnız yeni ekran
 * yazar; ekranlar yayımlanan derse karşı tekrar süzgecinden ve anahtar kapısından geçer, hafif doğrulayıcı da bakar.
 * Açık azalmazsa, çağrı düşerse ya da zaman aşarsa ders aynen kalır.
 */
export async function completeLessonCoverage(
  io: LessonIo,
  lesson: LessonV3,
  input: TeacherLessonInput,
  gaps: LessonCoverageGaps,
): Promise<CoverageCompletion> {
  const before = coverageGapCount(gaps);
  const mode = input.mode ?? "document";
  try {
    const answer = await withDeadline(
      io.write(teacherSystem(mode), coverageCompletionUserPrompt(lesson, input, gaps), () => undefined),
      COVERAGE_COMPLETION_MS,
    );
    if (!answer) return { verdict: "timeout", screens: [], before, after: before };
    const parsed = parseTeacherLesson(parseModelJson(answer.text), input.upcomingTopics);
    if (!parsed?.screens.length) return { verdict: "unparsed", screens: [], before, after: before };
    let extra = dedupScreens(
      settleCheckKeys(
        dropRepeatedScreens(lesson.screens, dropRepeatedChecks(lesson.screens, parsed.screens.slice(0, COVERAGE_COMPLETION_SCREENS))),
      ),
    ).screens;
    if (extra.length && input.sanity !== false) {
      const sanity = await runLessonSanity(
        (system, user) => io.write(system, user, () => undefined).then((reply) => reply.text),
        {
          mode,
          topicLabel: input.topicLabel,
          source: input.pages.map((page) => page.text).join("\n"),
          screens: extra,
          ...(input.noteWarnings?.length ? { noteWarnings: input.noteWarnings } : {}),
        },
        parseModelJson,
      );
      if (sanity) extra = sanity.screens;
    }
    const merged: LessonV3 = { ...lesson, screens: [...lesson.screens, ...extra] };
    const after = coverageGapCount(lessonCoverageGaps(merged, input));
    if (!extra.length || after >= before) return { verdict: "no_gain", screens: [], before, after: before };
    return {
      verdict: "added",
      screens: shuffleLessonChecks({ format: LESSON_V3_FORMAT, title: "", screens: extra }).screens,
      before,
      after,
    };
  } catch {
    return { verdict: "error", screens: [], before, after: before };
  }
}

export type TeacherLessonOutcome =
  | {
      ok: true;
      lesson: LessonV3;
      calls: number;
      ms: number;
      remainingLow: TeacherIssue[];
      /** Düzeltme turunu açtıran yüksek sorunlar (tur başına); yavaş dersi teşhis için. */
      fixTriggers: TeacherIssue[][];
      /** Düzeltilemediği için atılan kavramlar. */
      dropped: string[];
      /** Taslak ayrıştırılamadıysa nedeni (yeniden yazıldı). */
      draftNote: string | null;
  /** Denetçinin kısımlara verdiği öğretim puanları (1-5); kalite örneği olarak kaydedilir (23 Ekim 2026). */
  teachingScores?: number[];
  /** Kilit bilgi ve omurga kapandıysa true. Açık kapsam öğrencinin metnine yazılmaz. */
  done?: boolean;
}
  | { ok: false; status: number; error: string; reasons: string[]; draftNote?: string | null };

const WRITE_TIMEOUT_MS = 120_000;
/**
 * Yeniden yazım sürerken ders "takıldı" sayılmasın (`BUILD_STALE_MS` 120 sn): yayımlanan kısım
 * aynı hâliyle tazelenir, giriş kartında kavram "hazırlanıyor" kalır.
 */
const HEARTBEAT_MS = 40_000;

export type PublishedLesson = {
  /** Denetlenmiş ekranlar + giriş kartı; `done` olunca kapanış da. */
  lesson: LessonV3;
  done: boolean;
  /** Henüz yayımlanmamış ama yazılmış kavramların adları (giriş kartı planı). */
  upcoming: string[];
  /** Yazarın baştaki planı: kaç ekran yazacağı. Yazım sürerken sayacın paydası (28 Ekim 2026). */
  plannedScreens?: number;
};

export type LessonIo = {
  /** Yazar: akışla, tek çağrı. Her parça `onDelta`'ya; dönen bütün metin ve bitiş nedeni. */
  write: (system: string, user: string, onDelta: (delta: string) => void) => Promise<{ text: string; finish: string | null }>;
};

type Header = { title: string; overview?: string; objective?: string };
type Closing = Pick<LessonV3, "commonMistake" | "summary" | "nextFocus">;

type Part = { concept: string; key: string; screens: LessonScreen[]; last: boolean };

type PartOutcome =
  | {
      ok: true;
      screens: LessonScreen[];
      header?: Partial<Header>;
      closing?: Closing;
      low: TeacherIssue[];
      triggers: TeacherIssue[][];
      coveragePending?: boolean;
    }
  | { ok: false; high: TeacherIssue[]; triggers: TeacherIssue[][] };

/**
 * Soğuk dersin zaman çizgisi (19 Ekim 2026): "Farklı anlat" ile ilk ekran 30 sn, kayıtta yalnız
 * toplam süre ve çağrı sayısı vardı (111 sn, 15 çağrı, 5 tur). Ölçmeden hızlandırılmaz.
 */
export type PipelineTiming = {
  /** Akıştan ilk ekranın ayrıştığı an (ms, başlangıçtan). */
  firstScreenMs: number | null;
  /** İlk kavramın yazımı bitip denetime gittiği an. */
  firstPartMs: number | null;
  /** İlk kavramın öğrenciye yayımlandığı an. */
  firstPublishMs: number | null;
  /** Yazarın akışı bitirdiği an. */
  writeMs: number | null;
};

export type PipelineResult = {
  lesson: LessonV3 | null;
  issues: TeacherIssue[];
  fixTriggers: TeacherIssue[][];
  dropped: string[];
  draftNote: string | null;
  /** İlk kavram düzelmediyse onun yüksek sorunları. */
  failure: TeacherIssue[];
  timing: PipelineTiming;
  /** Denetçinin kısımlara verdiği ilk öğretim puanları (1-5), yazım sırasıyla (23 Ekim 2026). */
  teachingScores?: number[];
  /** Kapsam kapısı kapandıysa true. Öğrenciye etiket ya da eksik bölüm cümlesi yazılmaz. */
  done: boolean;
};

/**
 * Düzeltilmiş kısım. Model yalnız değiştirdiği ekranı döndürdüyse öbürleri yerinde kalır
 * (başlıkla eşlenir): 18 Ekim altın kıyasında KPSS dersinde tablonun durduğu ekran böyle
 * düşüyor, "metin tabloya gönderiyor ama tablo yok" sorunu üç turda da düzelmiyordu.
 * Başlıklar tutmuyorsa model kısmı bilerek yeniden kurmuştur (birleştirme): o alınır.
 */
export function mergePartScreens(current: LessonScreen[], fixed: LessonScreen[]): LessonScreen[] {
  if (fixed.length >= current.length) return fixed;
  const key = (screen: LessonScreen) => screen.heading.trim().toLocaleLowerCase("tr");
  const byHeading = new Map(fixed.map((screen) => [key(screen), screen]));
  const matched = current.filter((screen) => byHeading.has(key(screen))).length;
  if (matched !== fixed.length) return fixed;
  return current.map((screen) => byHeading.get(key(screen)) ?? screen);
}

/** Başlıktaki ekran planı; 1-12 dışı ya da sayı olmayan değer yok sayılır. */
export function plannedScreensOf(raw: unknown): number | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = Number((raw as Record<string, unknown>).plannedScreens);
  return Number.isInteger(value) && value >= 1 && value <= 12 ? value : undefined;
}

function headerOf(raw: unknown): Header | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  if (!title) return null;
  return {
    title,
    ...(typeof row.overview === "string" && row.overview.trim() ? { overview: row.overview.trim() } : {}),
    ...(typeof row.objective === "string" && row.objective.trim() ? { objective: row.objective.trim() } : {}),
  };
}

/**
 * Akışlı ders: yazım, kavram kavram denetim ve düzeltme, sırayla yayım. Krediye dokunmaz;
 * `runTeacherLesson` krediyi sarar, yerel ölçüm betiği doğrudan çağırır.
 */
export async function teacherLessonPipeline(
  io: LessonIo,
  input: TeacherLessonInput,
  options: { started?: number; onPublish?: (published: PublishedLesson) => Promise<void> | void } = {},
): Promise<PipelineResult> {
  const started = options.started ?? Date.now();
  const mode = input.mode ?? "document";
  const fixTriggers: TeacherIssue[][] = [];
  const dropped: string[] = [];
  const teachingScores: number[] = [];
  let draftNote: string | null = null;
  const timing: PipelineTiming = { firstScreenMs: null, firstPartMs: null, firstPublishMs: null, writeMs: null };
  const sinceStart = () => Date.now() - started;

  {
    const reader = new LessonStreamReader();
    const parts: Part[] = [];
    const outcomes: Promise<PartOutcome>[] = [];
    let header: Header | null = null;
    let plannedScreens: number | undefined;
    let closing: Closing | null = null;
    let streamEnded = false;
    let wake: () => void = () => undefined;
    const signal = () => wake();
    let headerResolve: (value: Header | null) => void = () => undefined;
    const headerReady = new Promise<Header | null>((resolve) => (headerResolve = resolve));
    let closingResolve: (value: Closing | null) => void = () => undefined;
    const closingReady = new Promise<Closing | null>((resolve) => (closingResolve = resolve));

    /*
      İlk kavramın denetimi ilk ekran biter bitmez başlar (18 Ekim 2026, canlı ölçüm: hızlı işlemde
      ilk ekran 15 sn'de geliyordu; ~3 sn'si kavramın bittiğini anlamak için sonraki ekranı
      beklemekti). Sonraki ekran aynı kavramdansa ya da ders tek kavramsa bu erken denetim atılır,
      kavram bütünüyle yeniden denetlenir.
    */
    let early: { promise: Promise<PartOutcome>; valid: boolean } | null = null;

    const reviewPart = async (index: number, _options: { early?: boolean } = {}): Promise<PartOutcome> => {
      const part = parts[index]!;
      // Tek geçiş: ayrışan ekran yayımlanır. Boş kavram da atılmaz; ekranı varsa öğrenciye gider.
      const screens = [...part.screens];
      // Hafif doğrulayıcı (30 Ekim 2026, ürün sahibinin kararı: bütün kavramlar): türü uymayan / uydurma şık, anahtar,
      // ekranda üçüncü kez tekrar eden süs kutusu. Sonraki kavramların çağrısı yazar akarken koşar; düşerse kavram aynen.
      const sanityRun =
        input.sanity === false
          ? null
          : runLessonSanity(
              (system, user) => io.write(system, user, () => undefined).then((answer) => answer.text),
              {
                mode,
                topicLabel: input.topicLabel,
                source: input.pages.map((page) => page.text).join("\n"),
                screens,
                ...(input.noteWarnings?.length ? { noteWarnings: input.noteWarnings } : {}),
              },
              parseModelJson,
            );
      const close = part.last ? await closingReady : null;
      const sanity = sanityRun ? await sanityRun : null;
      if (sanity) {
        console.info("lesson_sanity", {
          concept: part.concept.slice(0, 60),
          screens: screens.length,
          patched: sanity.patched,
          keyChanged: sanity.keyChanged,
          dropped: sanity.dropped,
          rejected: sanity.rejected,
          timedOut: sanity.timedOut,
          ms: sanity.ms,
          reasons: sanity.reasons.slice(0, 4),
        });
      }
      return {
        ok: true,
        screens: sanity ? sanity.screens : screens,
        header: {},
        ...(close ? { closing: close } : {}),
        low: [],
        triggers: [],
      };
    };

    const closePart = (last: boolean) => {
      const part = parts[parts.length - 1];
      if (!part || outcomes.length === parts.length) return;
      part.last = last;
      const index = parts.length - 1;
      if (index === 0) timing.firstPartMs ??= sinceStart();
      if (index === 0 && early) {
        if (early.valid && !last && part.screens.length === 1) {
          outcomes.push(early.promise);
          signal();
          return;
        }
        early.valid = false;
      }
      outcomes.push(reviewPart(index));
      signal();
    };

    const addScreen = (raw: unknown) => {
      const screen = parseTeacherScreen(raw);
      if (!screen) return;
      const concept = screenConcept(screen);
      const key = concept.toLocaleLowerCase("tr");
      const open = parts[parts.length - 1];
      if (open && outcomes.length < parts.length && open.key === key) {
        open.screens.push(screen);
        // İlk kavram iki ekranlı: tek ekranla başlayan erken denetim geçersiz.
        if (parts.length === 1 && early) early.valid = false;
        return;
      }
      // Yeni kavram: önceki kavram tamam, denetime gider.
      closePart(false);
      if (!parts.length) timing.firstScreenMs ??= sinceStart();
      parts.push({ concept, key, screens: [screen], last: false });
      if (parts.length === 1) early = { promise: reviewPart(0, { early: true }), valid: true };
    };

    const writing = io
      .write(teacherSystem(mode), teacherUserPrompt(input), (delta) => {
        for (const raw of reader.feed(delta)) {
          if (!header) {
            header = headerOf(reader.header);
            plannedScreens ??= plannedScreensOf(reader.header);
            if (header) headerResolve(header);
          }
          addScreen(raw);
        }
      })
      .then(
        (result) => ({ ...result, error: null as string | null }),
        (error: unknown) => ({ text: reader.fullText, finish: null, error: error instanceof Error ? error.message.slice(0, 160) : "unknown" }),
      );

    // Yayıncı: kısımları sırayla bekler; ilk kavram düşerse ders yok.
    const published: LessonScreen[] = [];
    let publishedHeader: Header | null = null;
    let publishedClosing: Closing | null = null;
    let failure: TeacherIssue[] = [];
    const lowIssues: TeacherIssue[] = [];
    const publishing = (async () => {
      for (let index = 0; ; index += 1) {
        while (!outcomes[index] && !(streamEnded && index >= outcomes.length)) {
          await new Promise<void>((resolve) => (wake = resolve));
        }
        if (!outcomes[index]) break;
        // Bu kavram uzun sürüyorsa (baştan yazım) yayımlanan kısım tazelenir: ders takıldı sayılmaz.
        const heartbeat =
          options.onPublish && publishedHeader
            ? setInterval(() => {
                void Promise.resolve(
                  options.onPublish!({
                    lesson: { format: LESSON_V3_FORMAT, ...publishedHeader!, screens: [...published] },
                    done: false,
                    upcoming: parts.slice(index).map((item) => item.concept),
                    ...(plannedScreens ? { plannedScreens } : {}),
                  }),
                ).catch(() => undefined);
              }, HEARTBEAT_MS)
            : null;
        const outcome = await outcomes[index]!.finally(() => {
          if (heartbeat) clearInterval(heartbeat);
        });
        fixTriggers.push(...outcome.triggers);
        if (!outcome.ok || !outcome.screens.length) continue;
        lowIssues.push(...outcome.low);
        if (!publishedHeader) {
          publishedHeader = { ...((await headerReady) ?? { title: input.topicLabel }), ...outcome.header };
          timing.firstPublishMs ??= sinceStart();
          failure = [];
        }
        if (outcome.closing) publishedClosing = outcome.closing;
        // Ders içi soru tekrarı yayımdan önce deterministik olarak düşer (25 Ekim 2026); anahtar açıklamasıyla
        // hizalanır, görsele gönderen soru çıkar (29 Ekim 2026) — karıştırmadan önce.
        // Ekran içi tekrar süzgeci (30 Ekim 2026): üçüncü kez geçen örnek ya da cümle süs kutusundan silinir.
        const deduped = dedupScreens(
          settleCheckKeys(dropRepeatedScreens(published, dropRepeatedChecks(published, outcome.screens)), {
            concept: parts[index]?.concept,
          }),
        );
        const fresh = deduped.screens;
        // Öğretim işaretleri (30 Ekim 2026): ekran içi tekrar, üstteki cümleyi geri soran soru, türü tutmayan çeldirici.
        // Tek geçişte yapı denetimi çağrılmıyor; ölçmeden kural değişmesin diye günlüğe yazılır, metne dokunulmaz.
        const flags = lessonTeachingFlags(fresh, input);
        if (flags.echo || flags.twin || flags.echoedCheck || flags.offKind || deduped.dropped) {
          console.info("teacher_lesson_teaching_flags", {
            concept: parts[index]?.concept?.slice(0, 60) ?? null,
            ...flags,
            deduped: deduped.dropped,
          });
        }
        published.push(...shuffleLessonChecks({ format: LESSON_V3_FORMAT, title: "", screens: fresh }).screens);
        if (options.onPublish && !(streamEnded && index === outcomes.length - 1)) {
          await options.onPublish({
            lesson: stripLessonIssueTags({ format: LESSON_V3_FORMAT, ...publishedHeader!, screens: [...published] }),
            done: false,
            upcoming: parts.slice(index + 1).map((item) => item.concept),
            ...(plannedScreens ? { plannedScreens } : {}),
          });
        }
      }
      return true;
    })();

    const written = await writing;
    timing.writeMs ??= sinceStart();
    // Akış bitti: son kavram kapanır; kapanış alanları bütün metinden.
    const whole = parseTeacherLesson(parseModelJson(written.text), input.upcomingTopics);
    if (!header) {
      header = headerOf(whole) ?? headerOf(reader.header);
      headerResolve(header);
    }
    // Akışta kaçan ekranlar aynı metinden alınır. İkinci model çağrısı yok.
    const streamed = parts.reduce((sum, item) => sum + item.screens.length, 0);
    if (whole && whole.screens.length > streamed) {
      for (const screen of whole.screens.slice(streamed)) addScreen(screen);
    }
    closing = whole ? { commonMistake: whole.commonMistake, summary: whole.summary, nextFocus: whole.nextFocus } : null;
    closingResolve(closing);
    closePart(true);
    streamEnded = true;
    signal();

    if (!parts.length) {
      draftNote = [
        written.error ? `hata: ${written.error}` : "",
        `bitiş: ${written.finish ?? "?"}`,
        `${written.text.length} karakter`,
        `${reader.screens.length} ekran okundu, ${reader.broken} bozuk`,
        `baş: ${written.text.slice(0, 120).replace(/\s+/g, " ")}`,
      ]
        .filter(Boolean)
        .join(" · ");
      console.error("teacher_lesson_draft_unreadable", { note: draftNote });
      await publishing.catch(() => false);
      return { lesson: null, issues: [], fixTriggers, dropped, draftNote, failure, timing, teachingScores, done: false };
    }

    const ok = await publishing;
    if (!ok || !published.length || !publishedHeader) {
      return { lesson: null, issues: [], fixTriggers, dropped, draftNote, failure, timing, teachingScores, done: false };
    }
    const finished: LessonV3 = {
      format: LESSON_V3_FORMAT,
      ...(publishedHeader as Header),
      screens: published,
      ...((publishedClosing as Closing | null) ?? {}),
    };
    // (1) Dört parça eksikse mevcut yeniden yazım (kapsam dışı; dokunulmadı).
    const gaps = fourPartGaps(finished);
    let delivered = finished;
    if (gaps.length) {
      const again = await io.write(
        teacherSystem(mode),
        `${teacherUserPrompt(input)}\n\nEKSİK PARÇALAR: aynı dersi JSON olarak döndür. Mevcut ekranları silme. Yalnız şunları ekle:\n${gaps.join("\n")}`,
        () => undefined,
      );
      const repaired = parseTeacherLesson(parseModelJson(again.text), input.upcomingTopics);
      if (repaired) {
        // Öğrenci yayımlanan ekranları karışık şık sırasıyla görüp cevapladı; onarım yalnız sona ekler.
        // Dersi onarımla değiştirmek şık sırasını sıfırlıyor, doğru cevap yanlış sayılıyordu (V6).
        const extra = dedupScreens(
          settleCheckKeys(
            dropRepeatedScreens(published, dropRepeatedChecks(published, repaired.screens.slice(finished.screens.length))),
          ),
        ).screens;
        const merged: LessonV3 = {
          ...finished,
          screens: [
            ...finished.screens,
            ...shuffleLessonChecks({ format: LESSON_V3_FORMAT, title: "", screens: extra }).screens,
          ],
          commonMistake: finished.commonMistake ?? repaired.commonMistake,
          summary: finished.summary ?? repaired.summary,
          nextFocus: finished.nextFocus ?? repaired.nextFocus,
        };
        if (fourPartGaps(merged).length < gaps.length) delivered = merged;
      }
    }
    // (2) Kapsam açığı kaldıysa yalnız eksikleri öğreten en çok iki ekran (30 Ekim 2026); düşerse ders aynen kalır.
    const gapsLeft = lessonCoverageGaps(delivered, input);
    if (coverageGapCount(gapsLeft) > 0) {
      const coverageStarted = Date.now();
      const coverage = await completeLessonCoverage(io, delivered, input, gapsLeft);
      if (coverage.verdict === "added") delivered = { ...delivered, screens: [...delivered.screens, ...coverage.screens] };
      console.info("teacher_lesson_coverage", {
        verdict: coverage.verdict,
        before: coverage.before,
        after: coverage.after,
        added: coverage.screens.length,
        missing: [...gapsLeft.headings, ...gapsLeft.facts].slice(0, 6).map((item) => item.slice(0, 60)),
        ms: Date.now() - coverageStarted,
      });
    }
    // (3) diagram_card yoksa yalnız kartı isteyen tek küçük çağrı (29 Ekim 2026); düşerse ders aynen yayımlanır.
    if (parametricDiagramIssue(delivered)) {
      const completion = await completeLessonDiagram(io, delivered, input);
      if (completion.lesson) delivered = completion.lesson;
    }
    const done = !lessonLevelStructureIssues(delivered, input).some(isCoverageIssue);
    return {
      lesson: stripLessonIssueTags(delivered),
      issues: lowIssues,
      fixTriggers,
      dropped,
      draftNote,
      failure: [],
      timing,
      teachingScores,
      done,
    };
  }
}

/**
 * OpenAI çağrısı: yazar akışla ve düşük düşünmeyle, tek sefer. Öğrenci beklerken hızlı işlem.
 * Yerel ölçüm betiği de bunu kullanır: canlıyla aynı ayar.
 */
export function createLessonIo(
  openai: OpenAI,
  model: string,
  options: {
    fast?: boolean;
    /** Öğrenci profili (`student-pedagogy.ts`): yazar isteminin sonuna eklenir. */
    profile?: string;
    onCall?: () => void;
    onUsage: (usage: OpenAI.CompletionUsage | null | undefined, servedTier: string | null | undefined) => Promise<void> | void;
    /** Yazım süresi ve ilk jetona kadar geçen süre, kayıt için. */
    onTiming?: (event: { role: "write"; ms: number; firstTokenMs?: number }) => void;
  },
): LessonIo {
  const tier = options.fast ? ({ service_tier: "fast" } as const) : {};
  return {
    write: async (system, user, onDelta) => {
      options.onCall?.();
      const callStarted = Date.now();
      let firstTokenMs: number | undefined;
      const stream = await openai.chat.completions.create(
        {
          model,
          response_format: { type: "json_object" },
          stream: true,
          stream_options: { include_usage: true },
          reasoning_effort: "low",
          ...tier,
          messages: [
            { role: "system", content: withStudentProfile(system, options.profile ?? "") },
            { role: "user", content: user },
          ],
        },
        { signal: AbortSignal.timeout(WRITE_TIMEOUT_MS) },
      );
      let text = "";
      let finish: string | null = null;
      let usage: OpenAI.CompletionUsage | null = null;
      let served: string | null = null;
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) {
          firstTokenMs ??= Date.now() - callStarted;
          text += delta;
          try {
            onDelta(delta);
          } catch (error) {
            console.error("teacher_lesson_delta_failed", { cause: error instanceof Error ? error.message.slice(0, 120) : "unknown" });
          }
        }
        finish = chunk.choices[0]?.finish_reason ?? finish;
        if (chunk.usage) usage = chunk.usage;
        if (chunk.service_tier) served = chunk.service_tier;
      }
      await options.onUsage(usage, served);
      options.onTiming?.({ role: "write", ms: Date.now() - callStarted, firstTokenMs });
      return { text, finish };
    },
  };
}

/**
 * Taslak → kavram kavram denetim → (gerekirse) yalnız o kavramın düzeltmesi.
 * Kredi bir kez ayrılır; ders dönerse kesinleşir, dönmezse iade edilir.
 */
async function runTeacherLessonInner(
  service: SupabaseClient,
  input: TeacherLessonInput & {
    userId: string;
    actionCode: ActionCode;
    idempotencyKey: string;
    /** Ücretsiz hesabın sayacı (`reserveCredits`); verilmezse işin varsayılanı. */
    freeMeter?: FreeMeter | null;
    /** İsteğin başladığı an (temizlik dahil); süre sınırı buna göre. */
    startedAt?: number;
    /**
     * false: sıradaki dersin önceden yazımı. Kredi ayrılmaz; öğrenci dersi
     * açınca düşer. Model kullanımı ayrı kodla (LESSON_PREFETCH) yazılır.
     */
    charge?: boolean;
    /** OpenAI hızlı işlem (jeton fiyatı 2 kat; ürün sahibinin kararı, 18 Ekim 2026): öğrenci bekliyorsa. */
    fast?: boolean;
    /** Denetlenen her kavram yayımlanınca (parça parça açılış). */
    onPublish?: (published: PublishedLesson) => Promise<void> | void;
  },
): Promise<TeacherLessonOutcome> {
  if (!env.OPENAI_API_KEY) return { ok: false, status: 503, error: "generation_failed", reasons: ["no_api_key"] };
  if (!input.pages.length && input.mode !== "topic") {
    return { ok: false, status: 503, error: "source_unavailable", reasons: ["no_pages"] };
  }

  const charge = input.charge !== false;
  let reservationId: string | null = null;
  if (charge) {
    const reservation = await reserveCredits(service, input.userId, input.actionCode, input.idempotencyKey, 1, { freeMeter: input.freeMeter });
    if (!reservation.ok) {
      return {
        ok: false,
        status: reservation.reason === "insufficient_credits" ? 402 : 409,
        error: refusalCode(reservation),
        reasons: [],
      };
    }
    reservationId = reservation.reservationId;
  }
  const refund = async () => {
    if (reservationId) await refundCredits(service, reservationId).catch(() => undefined);
  };

  const started = input.startedAt ?? Date.now();
  const model = contentModel();
  const openai = openaiClient({ apiKey: env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 1 });
  let calls = 0;
  const record = async (usage: OpenAI.CompletionUsage | null | undefined, servedTier: string | null | undefined) => {
    // Hızlı işlemin fiyatı ayrı satırda (ai_model_prices: "<model>-fast"); düşürülen istek normal fiyattır.
    const billed = servedTier === "fast" || servedTier === "priority" ? `${model}-fast` : model;
    await recordUsage(service, {
      userId: input.userId,
      actionCode: charge ? input.actionCode : "LESSON_PREFETCH",
      model: billed,
      tokensIn: usage?.prompt_tokens ?? 0,
      tokensOut: usage?.completion_tokens ?? 0,
      reservationId,
    }).catch(() => undefined);
  };
  /** Çağrı süreleri rol rol (sn, bir ondalık) ve yazarın ilk jetonu: kayıt için. */
  const callMs: Record<string, number[]> = {};
  let firstTokenMs: number | undefined;
  // Hızlı işlem yalnız Plus/Sigma ve kurucuya (19 Ekim 2026, ürün sahibinin kararı; `fast-access.ts`).
  const profileLoad = studentPedagogyBlock(service, input.userId, "lesson");
  const fast = Boolean(input.fast) && (await fastAllowedFor(service, input.userId));
  const profile = await profileLoad;
  const io = createLessonIo(openai, model, {
    fast,
    profile,
    onCall: () => {
      calls += 1;
    },
    onUsage: record,
    onTiming: (event) => {
      (callMs[event.role] ??= []).push(Math.round(event.ms / 100) / 10);
      if (event.role === "write" && firstTokenMs === undefined) firstTokenMs = event.firstTokenMs;
    },
  });

  try {
    const result = await teacherLessonPipeline(
      io,
      { ...input, coverageBudget: input.coverageBudget ?? (charge ? "student" : "prefetch") },
      { started, onPublish: input.onPublish },
    );
    console.info("teacher_lesson", {
      topic: input.topicLabel.slice(0, 80),
      pages: input.pages.map((item) => item.page),
      calls,
      screens: result.lesson?.screens.length ?? 0,
      coveragePending: Boolean(result.lesson) && !result.done,
      ms: Date.now() - started,
      fast,
      rounds: result.fixTriggers.length,
      dropped: result.dropped.length,
      low: result.issues.length,
      // 19 Ekim 2026: soğuk dersin zaman çizgisi (ms) — ilk jeton, ilk ekran, ilk kavram, ilk yayın, akış sonu.
      firstTokenMs,
      ...result.timing,
      callS: callMs,
      // Denetçinin düzeltme istettiği yüksek sorunlar (tur tur, kısaltılmış): 19 Ekim 2026'da
      // tek sayfalık KPSS dersinde 7 tur ve atılan kavram vardı, sebebi kayıtta yoktu.
      fixWhy: result.fixTriggers.slice(0, 8).map((round) =>
        round.slice(0, 2).map((issue) => `${issue.where}: ${issue.problem}`.slice(0, 140)),
      ),
      ...(result.dropped.length ? { droppedConcepts: result.dropped.slice(0, 4) } : {}),
      // Öğretim puanı (23 Ekim 2026): kısım kısım, denetçinin ilk okuyuşu.
      ...(result.teachingScores?.length ? { teaching: result.teachingScores } : {}),
    });
    if (!result.lesson) {
      await refund();
      return {
        ok: false,
        status: 503,
        error: "generation_failed",
        reasons: result.failure.length
          ? result.failure.slice(0, 6).map((issue) => `${issue.where}: ${issue.problem}`.slice(0, 400))
          : ["schema"],
        draftNote: result.draftNote,
      };
    }
    if (reservationId) await commitCredits(service, reservationId);
    return {
      ok: true,
      lesson: result.lesson,
      calls,
      ms: Date.now() - started,
      remainingLow: result.issues,
      fixTriggers: result.fixTriggers,
      dropped: result.dropped,
      draftNote: result.draftNote,
      teachingScores: result.teachingScores ?? [],
      done: result.done,
    };
  } catch (error) {
    await refund();
    console.error("teacher_lesson_failed", {
      topic: input.topicLabel.slice(0, 80),
      calls,
      cause: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return { ok: false, status: 503, error: "generation_failed", reasons: ["model_error"] };
  }
}

/**
 * Üretim yuvasıyla (19 Ekim 2026, Faz 3.2): yuvalar doluysa öğrenci isteği yer bekler, yine doluysa
 * `generation_busy`; önceden yazım beklemez. Kredi ayrılmadan önce: dolu kapıda öğrenciden bir şey düşmez.
 */
export async function runTeacherLesson(...args: Parameters<typeof runTeacherLessonInner>): Promise<TeacherLessonOutcome> {
  return withGenerationSlot(
    args[1].charge === false ? "prefetch" : "student",
    () => runTeacherLessonInner(...args),
    () => ({ ok: false, status: 503, error: "generation_busy", reasons: [] }),
  );
}
