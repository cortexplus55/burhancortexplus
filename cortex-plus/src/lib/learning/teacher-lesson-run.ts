import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { env, type ActionCode } from "@/lib/env";
import { contentModel } from "@/lib/ai/model-router";
import { commitCredits, recordUsage, refundCredits, reserveCredits } from "@/lib/credits/service";
import { parseModelJson } from "@/lib/learning/teaching-standards";
import { LESSON_V3_FORMAT, screenConcept, type LessonScreen, type LessonV3 } from "@/lib/learning/lesson-v3";
import { LessonStreamReader } from "@/lib/learning/lesson-stream";
import {
  fixPartSystem,
  fixPartUserPrompt,
  parseIssues,
  parsePartFix,
  parseTeacherLesson,
  parseTeacherScreen,
  partStructureIssues,
  rewritePartUserPrompt,
  shuffleLessonChecks,
  teacherSystem,
  teacherUserPrompt,
  verifyPartUserPrompt,
  verifySystem,
  type LessonPart,
  type TeacherDispute,
  type TeacherIssue,
  type TeacherLessonInput,
} from "@/lib/learning/teacher-lesson";

/*
  Öğretmen ders motoru, akışlı (18 Ekim 2026, ürün sahibinin kararı: "ders ~10 sn'de açılsın,
  kaliteden ödün verilmesin").

  17 Ekim canlı ölçümü: taslak 43 sn + denetim 22 sn + iki düzeltme turu (her biri dersin
  TAMAMINI baştan yazıyordu) 35+22, 35+30 sn → ~4 dk ve tek bir eşik itirazıyla ders atıldı.

  Yeni yol:
  - Yazar dersi akışla yazar (düşük düşünme: aynı derste denetçi daha fazla sorun bulmadı,
    ilk ekran 6-14 sn'de bitiyor). Her kavramın ekranları biter bitmez denetime gider.
  - Düzeltme yalnız sorunlu kavramı yeniden yazar; yazar haksız bulduğu itiraza gerekçe
    yazar, denetçi bir sonraki turda o gerekçeyi tartar.
  - Kavramlar sırayla yayımlanır (`onPublish`); öğrenci denetlenmemiş ekran görmez.
    Düzeltilemeyen kavram bir kez BAŞTAN yazılır ve yeniden denetlenir (18 Ekim 2026); o da
    geçmezse atılır ve öğrenciye söylenir (`missingConcepts`). İlk kavram düzelmezse ders yazılmaz.
  - Öğrenci beklerken hızlı işlem (ürün sahibinin kararı: önce yalnız Plus, aynı gün herkese).
  Kod ders metnine hiçbir şey eklemez.
*/

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
    }
  | { ok: false; status: number; error: string; reasons: string[]; draftNote?: string | null };

/** Yeni düzeltme turu isteğin başından bu kadar süre geçtiyse başlamaz (300 sn fonksiyon sınırı). */
const FIX_DEADLINE_MS = 150_000;
const MAX_FIX_ROUNDS = 2;
const WRITE_TIMEOUT_MS = 120_000;
/**
 * Düzelmeyen kavram atılmadan önce bir kez baştan yazılır (18 Ekim 2026, ürün sahibinin kararı).
 * Baştan yazım bu süreden sonra başlamaz; ardından gelen denetim/düzeltme ikinci sınıra kadar sürer.
 */
const REWRITE_START_MS = 170_000;
const REWRITE_DEADLINE_MS = 230_000;
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
};

export type LessonIo = {
  /** Yazar: akışla. Her parça `onDelta`'ya; dönen bütün metin ve bitiş nedeni. */
  write: (system: string, user: string, onDelta: (delta: string) => void) => Promise<{ text: string; finish: string | null }>;
  /** Denetçi ve düzeltme: tek seferlik JSON. */
  /** `fix`: ilk kavram (öğrenci bekliyor), düşük düşünme. `fix-careful`: sonraki kavramlar, varsayılan düşünme. */
  ask: (system: string, user: string, role: "verify" | "fix" | "fix-careful") => Promise<unknown | null>;
};

type Header = { title: string; overview?: string; objective?: string };
type Closing = Pick<LessonV3, "commonMistake" | "summary" | "nextFocus">;

type Part = { concept: string; key: string; screens: LessonScreen[]; last: boolean };

type PartOutcome =
  | { ok: true; screens: LessonScreen[]; header?: Partial<Header>; closing?: Closing; low: TeacherIssue[]; triggers: TeacherIssue[][] }
  | { ok: false; high: TeacherIssue[]; triggers: TeacherIssue[][] };

export type PipelineResult = {
  lesson: LessonV3 | null;
  issues: TeacherIssue[];
  fixTriggers: TeacherIssue[][];
  dropped: string[];
  draftNote: string | null;
  /** İlk kavram düzelmediyse onun yüksek sorunları. */
  failure: TeacherIssue[];
};

/** Sorunun yeri bu kısmın içinde mi: ekran numarası, giriş alanları ya da kapanış. */
function issueInPart(issue: TeacherIssue, part: LessonPart): boolean {
  const places = issue.where.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
  if (!places.length) return true;
  return places.some((place) => {
    const screen = /^screens\[(\d+)\]/.exec(place);
    if (screen) return Number(screen[1]) >= part.from && Number(screen[1]) <= part.to;
    if (/^(title|overview|objective)\b/.test(place)) return part.header;
    if (/^(commonMistake|summary|nextFocus)\b/.test(place)) return part.closing;
    // "screens", "ders" gibi genel yer: bu kısma ait sayılır.
    return true;
  });
}

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
  let draftNote: string | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const reader = new LessonStreamReader();
    const parts: Part[] = [];
    const outcomes: Promise<PartOutcome>[] = [];
    let header: Header | null = null;
    let closing: Closing | null = null;
    let streamEnded = false;
    // İlk kavram düştüyse ders yazılmayacak: öbür kavramların denetimi boşuna sürmesin.
    let cancelled = false;
    let wake: () => void = () => undefined;
    const signal = () => wake();
    let headerResolve: (value: Header | null) => void = () => undefined;
    const headerReady = new Promise<Header | null>((resolve) => (headerResolve = resolve));
    let closingResolve: (value: Closing | null) => void = () => undefined;
    const closingReady = new Promise<Closing | null>((resolve) => (closingResolve = resolve));

    /** Bir kısmın denetim bağlamı: önceki kısımların son hâli + bu kısım (+ kapanış). */
    const context = (index: number, screens: LessonScreen[], head: Header, close: Closing | null): { lesson: LessonV3; part: LessonPart } => {
      const before = parts.slice(0, index).flatMap((item) => item.screens);
      const lesson: LessonV3 = {
        format: LESSON_V3_FORMAT,
        ...head,
        screens: [...before, ...screens],
        ...(close ?? {}),
      };
      return {
        lesson,
        part: { from: before.length, to: before.length + screens.length - 1, header: index === 0, closing: parts[index]!.last },
      };
    };

    /*
      İlk kavramın denetimi ilk ekran biter bitmez başlar (18 Ekim 2026, canlı ölçüm: hızlı işlemde
      ilk ekran 15 sn'de geliyordu; ~3 sn'si kavramın bittiğini anlamak için sonraki ekranı
      beklemekti). Sonraki ekran aynı kavramdansa ya da ders tek kavramsa bu erken denetim atılır,
      kavram bütünüyle yeniden denetlenir.
    */
    let early: { promise: Promise<PartOutcome>; valid: boolean } | null = null;

    const reviewPart = async (index: number, options: { early?: boolean } = {}): Promise<PartOutcome> => {
      const part = parts[index]!;
      // Erken denetim kendi kopyasıyla çalışır: kavrama sonradan eklenen ekran onu değiştirmesin.
      let screens = [...part.screens];
      const current = () => !options.early || early?.valid !== false;
      let head = (await headerReady) ?? { title: input.topicLabel };
      let close = part.last ? await closingReady : null;
      let headerPatch: Partial<Header> = {};
      let disputes: TeacherDispute[] = [];
      const triggers: TeacherIssue[][] = [];
      // İlk kavramda öğrenci bekliyor: iki tur. Sonrakiler öğrenci okurken düzelir: bir tur fazla.
      let rounds = index === 0 ? MAX_FIX_ROUNDS : MAX_FIX_ROUNDS + 1;
      let rewritten = false;
      for (let round = 0; ; round += 1) {
        if (cancelled || !current()) return { ok: false, high: [], triggers };
        const { lesson, part: span } = context(index, screens, { ...head, ...headerPatch }, close);
        // Kod kuralları düzeltme isteminde işaretli: yazar bunlara itiraz edemez.
        const structural = partStructureIssues(lesson, span, input).map((issue) => ({ ...issue, problem: `[yapı kuralı] ${issue.problem}` }));
        let factual: TeacherIssue[];
        try {
          factual = parseIssues(await io.ask(verifySystem(mode), verifyPartUserPrompt(lesson, span, input, disputes), "verify"));
        } catch (error) {
          // Denetçi düşerse kavram körlemesine yayımlanmaz.
          factual = [{ where: "ders", severity: "high", problem: `Denetim yapılamadı: ${error instanceof Error ? error.message.slice(0, 80) : "bilinmiyor"}` }];
        }
        const issues = [...structural, ...factual.filter((issue) => issueInPart(issue, span))];
        const high = issues.filter((issue) => issue.severity === "high");
        if (!high.length) {
          return { ok: true, screens, header: headerPatch, ...(close ? { closing: close } : {}), low: issues, triggers };
        }
        const deadline = rewritten ? REWRITE_DEADLINE_MS : FIX_DEADLINE_MS;
        if (round >= rounds || Date.now() - started > deadline) {
          // Atmadan önce bir kez baştan: yama aynı yerde takılıyordu (Pediatri, üç tur aynı sorun).
          if (rewritten || Date.now() - started > REWRITE_START_MS || !current()) return { ok: false, high, triggers };
          rewritten = true;
          triggers.push(high);
          let fresh: ReturnType<typeof parsePartFix> = null;
          try {
            fresh = parsePartFix(
              await io.ask(fixPartSystem(mode), rewritePartUserPrompt(lesson, span, high, input), "fix-careful"),
              lesson,
              input.upcomingTopics,
            );
          } catch {
            fresh = null;
          }
          if (!fresh?.screens.length) return { ok: false, high, triggers };
          // Yeni taslak eskisinin yerine geçer (yama değil); kavram adı korunur, ekranlar bir araya kalsın.
          screens = fresh.screens.map((screen) => ({ ...screen, concept: part.concept }));
          disputes = [];
          if (span.closing) {
            close = {
              ...(close ?? {}),
              ...(fresh.commonMistake ? { commonMistake: fresh.commonMistake } : {}),
              ...(fresh.summary ? { summary: fresh.summary } : {}),
            };
          }
          if (current()) part.screens = screens;
          // Yeni taslak denetlenir; gerekirse bir düzeltme turu daha.
          rounds = round + 2;
          continue;
        }
        triggers.push(high);
        let fixed: ReturnType<typeof parsePartFix> = null;
        try {
          fixed = parsePartFix(await io.ask(fixPartSystem(mode), fixPartUserPrompt(lesson, span, issues, input), index === 0 ? "fix" : "fix-careful"), lesson, input.upcomingTopics);
        } catch {
          fixed = null;
        }
        if (!fixed) return { ok: false, high, triggers };
        disputes = fixed.disputes;
        if (fixed.screens.length) screens = mergePartScreens(screens, fixed.screens);
        if (span.header) {
          headerPatch = {
            ...headerPatch,
            ...(fixed.title ? { title: fixed.title } : {}),
            ...(fixed.overview ? { overview: fixed.overview } : {}),
            ...(fixed.objective ? { objective: fixed.objective } : {}),
          };
        }
        if (span.closing) {
          close = {
            ...(close ?? {}),
            ...(fixed.commonMistake ? { commonMistake: fixed.commonMistake } : {}),
            ...(fixed.summary ? { summary: fixed.summary } : {}),
          };
        }
        // Öbür kısımların bağlamı da son hâli görsün (atılmış erken denetim yazmaz).
        if (current()) part.screens = screens;
        head = { ...head, ...headerPatch };
      }
    };

    const closePart = (last: boolean) => {
      const part = parts[parts.length - 1];
      if (!part || outcomes.length === parts.length) return;
      part.last = last;
      const index = parts.length - 1;
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
      parts.push({ concept, key, screens: [screen], last: false });
      if (parts.length === 1) early = { promise: reviewPart(0, { early: true }), valid: true };
    };

    const writing = io
      .write(teacherSystem(mode), teacherUserPrompt(input), (delta) => {
        for (const raw of reader.feed(delta)) {
          if (!header) {
            header = headerOf(reader.header);
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
                  }),
                ).catch(() => undefined);
              }, HEARTBEAT_MS)
            : null;
        const outcome = await outcomes[index]!.finally(() => {
          if (heartbeat) clearInterval(heartbeat);
        });
        fixTriggers.push(...outcome.triggers);
        if (!outcome.ok) {
          if (index === 0) {
            failure = outcome.high;
            cancelled = true;
            return false;
          }
          dropped.push(parts[index]!.concept);
          continue;
        }
        lowIssues.push(...outcome.low);
        if (index === 0) publishedHeader = { ...((await headerReady) ?? { title: input.topicLabel }), ...outcome.header };
        if (outcome.closing) publishedClosing = outcome.closing;
        published.push(...shuffleLessonChecks({ format: LESSON_V3_FORMAT, title: "", screens: outcome.screens }).screens);
        if (options.onPublish && !(streamEnded && index === outcomes.length - 1)) {
          await options.onPublish({
            lesson: { format: LESSON_V3_FORMAT, ...publishedHeader!, screens: [...published] },
            done: false,
            upcoming: parts.slice(index + 1).map((item) => item.concept),
          });
        }
      }
      return true;
    })();

    const written = await writing;
    // Akış bitti: son kavram kapanır; kapanış alanları bütün metinden.
    const whole = parseTeacherLesson(parseModelJson(written.text), input.upcomingTopics);
    if (!header) {
      header = headerOf(whole) ?? headerOf(reader.header);
      headerResolve(header);
    }
    // Akışta yakalanamayan ekranlar (ayrıştırılamayan parça) bütün metinden tamamlanır.
    const streamed = parts.reduce((sum, item) => sum + item.screens.length, 0);
    if (whole && whole.screens.length > streamed && reader.broken) {
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
      console.error("teacher_lesson_draft_unreadable", { attempt, note: draftNote });
      await publishing.catch(() => false);
      // Hiçbir şey yayımlanmadı: bir kez baştan yazdır.
      continue;
    }

    const ok = await publishing;
    if (!ok || !published.length || !publishedHeader) {
      return { lesson: null, issues: [], fixTriggers, dropped, draftNote, failure };
    }
    const lesson: LessonV3 = {
      format: LESSON_V3_FORMAT,
      ...(publishedHeader as Header),
      screens: published,
      ...((publishedClosing as Closing | null) ?? {}),
    };
    return { lesson, issues: lowIssues, fixTriggers, dropped, draftNote, failure: [] };
  }
  return { lesson: null, issues: [], fixTriggers, dropped, draftNote, failure: [] };
}

/**
 * OpenAI çağrıları: yazar akışla ve düşük düşünmeyle (17 Ekim ölçümü: ilk ekran 6-14 sn, denetçi
 * daha fazla sorun bulmadı), denetçi varsayılan düşünmeyle, düzeltme düşük düşünmeyle. Öğrenci
 * beklerken hızlı işlem. Yerel ölçüm betiği de bunu kullanır: canlıyla aynı ayar.
 */
export function createLessonIo(
  openai: OpenAI,
  model: string,
  options: {
    fast?: boolean;
    onCall?: () => void;
    onUsage: (usage: OpenAI.CompletionUsage | null | undefined, servedTier: string | null | undefined) => Promise<void> | void;
  },
): LessonIo {
  const tier = options.fast ? ({ service_tier: "fast" } as const) : {};
  return {
    write: async (system, user, onDelta) => {
      options.onCall?.();
      const stream = await openai.chat.completions.create(
        {
          model,
          response_format: { type: "json_object" },
          stream: true,
          stream_options: { include_usage: true },
          reasoning_effort: "low",
          ...tier,
          messages: [
            { role: "system", content: system },
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
      return { text, finish };
    },
    ask: async (system, user, role) => {
      options.onCall?.();
      const response = await openai.chat.completions.create({
        model,
        response_format: { type: "json_object" },
        // Denetçi ölçer: varsayılan düşünme. Düzeltme yazar işi: düşük.
        ...(role === "fix" ? { reasoning_effort: "low" as const } : {}),
        ...tier,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      await options.onUsage(response.usage, response.service_tier);
      return parseModelJson(response.choices[0]?.message?.content ?? "");
    },
  };
}

/**
 * Taslak → kavram kavram denetim → (gerekirse) yalnız o kavramın düzeltmesi.
 * Kredi bir kez ayrılır; ders dönerse kesinleşir, dönmezse iade edilir.
 */
export async function runTeacherLesson(
  service: SupabaseClient,
  input: TeacherLessonInput & {
    userId: string;
    actionCode: ActionCode;
    idempotencyKey: string;
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
    const reservation = await reserveCredits(service, input.userId, input.actionCode, input.idempotencyKey);
    if (!reservation.ok) {
      return {
        ok: false,
        status: reservation.reason === "insufficient_credits" ? 402 : 409,
        error: reservation.reason,
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
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 1 });
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
  const io = createLessonIo(openai, model, {
    fast: input.fast,
    onCall: () => {
      calls += 1;
    },
    onUsage: record,
  });

  try {
    const result = await teacherLessonPipeline(io, input, { started, onPublish: input.onPublish });
    console.info("teacher_lesson", {
      topic: input.topicLabel.slice(0, 80),
      pages: input.pages.map((item) => item.page),
      calls,
      ms: Date.now() - started,
      fast: Boolean(input.fast),
      rounds: result.fixTriggers.length,
      dropped: result.dropped.length,
      low: result.issues.length,
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
