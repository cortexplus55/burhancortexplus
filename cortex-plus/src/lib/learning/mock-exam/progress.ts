/**
 * Yazılı deneme kurulumunun ilerlemesi (25 Ekim 2026, canlı test P1-1).
 *
 * Ekran 1,8 sn'de bir "Konu N hazırlanıyor" ekliyor ve dördüncü satırda duruyordu; canlıda 3,5 dk
 * boyunca "Konu 3 hazırlanıyor" yazdı. Sayı artık biten konulardan gelir: uç NDJSON satırları akıtır
 * (`{type:"progress",done,total,label}`), son satır sonuçtur.
 *
 * Durum yoklaması (29 Ekim 2026, Paket H): ekran "durum sor" için üretim POST'unu yeniden çağırıyordu.
 * Kira sahibi istek sessizce ölünce her POST `running:true` dönüyor, bütçe bitince öğrenciye düğme
 * kalıyordu — kâğıt çoktan yayımlanmış olsa bile. Şimdi POST döngüsüne paralel, salt okuyan bir GET
 * (`/mock-exam/status`) 4 sn'de bir "yayımlandı mı?" diye sorar; yayımlandıysa POST döngüsü kesilir ve
 * sınav açılır. Yoklama kimliği tarayıcıda saklanır: sayfa yenilenince sürer.
 */
import { AUTO_RETRY_DELAY_MS, isRetryableFailure } from "@/lib/learning/generation-retry";

export type MockExamProgress = { done: number; total: number; label: string | null };

export function mockProgressCounter(
  total: number,
  onProgress?: (progress: MockExamProgress) => void,
  initialDone = 0,
): (label: string | null) => void {
  let done = Math.max(0, Math.min(total, initialDone));
  onProgress?.({ done, total, label: null });
  return (label) => {
    done = Math.min(total, done + 1);
    onProgress?.({ done, total, label });
  };
}

/** Aynı toplamda sayı geri gitmez. Yeni istek 0 yazsa da ekran kaldığı yerde kalır. */
export function monotonicProgress(previous: MockExamProgress | null, next: MockExamProgress): MockExamProgress | null {
  if (previous && previous.total === next.total && next.done < previous.done) return previous;
  return next;
}

/** Ekrandaki satır: hangi konu bitti, kaç konudan kaçı hazır. */
export function mockProgressLine(progress: MockExamProgress): string {
  if (!progress.total) return "Konular okunuyor…";
  if (progress.done >= progress.total) return `${progress.total} konunun ${progress.total}'i hazır · sorular toparlanıyor…`;
  const head = `${progress.total} konunun ${progress.done}'i hazır`;
  return progress.label ? `${head} · son biten: ${progress.label}` : `${head} · konular yazılıyor…`;
}

export type MockStreamLine =
  | ({ type: "progress" } & MockExamProgress & { resumeId?: string })
  | { type: "done"; status: number; data: Record<string, unknown> };

/* ------------------------------------------------------------------------------------------------
 * Durum yoklaması
 * ---------------------------------------------------------------------------------------------- */

/** Salt okuyan durum ucunun cevabı. `unknown`: okunamadı, yoklayıcı sürer. */
export type MockExamStatus =
  | { state: "published"; examId: string; resumeId?: string; jobId?: string }
  | {
      state: "running";
      resumeId?: string;
      jobId?: string;
      /** Kira hâlâ birinin elinde mi. `false`: kimse yazmıyor, istemci bir POST ile devralabilir. */
      leaseAlive?: boolean;
      topicsReady?: number;
      topicTotal?: number;
      ready?: number;
      promised?: number;
    }
  | { state: "failed"; resumeId?: string; jobId?: string; code?: string }
  | { state: "unknown" };

export type MockStatusIds = {
  prepId: string;
  /** Kurulumun başladığı an (ISO). Bu andan önceki kâğıtlar bu isteğin kâğıdı değildir. */
  since: string;
  resumeId?: string | null;
  jobId?: string | null;
};

export const MOCK_STATUS_PATH = "/api/learning/exam-prep/mock-exam/status";
export const MOCK_STATUS_INTERVAL_MS = 4_000;
/** Yoklama en çok bu kadar sürer; sonra ekran eldeki düğmelerle kalır. */
export const MOCK_STATUS_MAX_MS = 20 * 60 * 1000;

export function mockStatusUrl(ids: MockStatusIds): string {
  const params = new URLSearchParams({ prepId: ids.prepId, since: ids.since });
  if (ids.resumeId) params.set("resumeId", ids.resumeId);
  if (ids.jobId) params.set("jobId", ids.jobId);
  return `${MOCK_STATUS_PATH}?${params.toString()}`;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Bozuk ya da eksik cevap `unknown` sayılır; yoklayıcı hata vermez, sürer. */
export function parseMockExamStatus(raw: unknown): MockExamStatus {
  if (!raw || typeof raw !== "object") return { state: "unknown" };
  const data = raw as Record<string, unknown>;
  const resumeId = optionalString(data.resumeId);
  const jobId = optionalString(data.jobId);
  if (data.state === "published") {
    const examId = optionalString(data.examId);
    return examId ? { state: "published", examId, resumeId, jobId } : { state: "unknown" };
  }
  if (data.state === "failed") return { state: "failed", resumeId, jobId, code: optionalString(data.code) };
  if (data.state === "running") {
    return {
      state: "running",
      resumeId,
      jobId,
      leaseAlive: typeof data.leaseAlive === "boolean" ? data.leaseAlive : undefined,
      topicsReady: optionalNumber(data.topicsReady),
      topicTotal: optionalNumber(data.topicTotal),
      ready: optionalNumber(data.ready),
      promised: optionalNumber(data.promised),
    };
  }
  return { state: "unknown" };
}

/** `setTimeout`, iptalde erken döner; iptal edilen bekleyiş hata değildir. */
function abortableWait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal?.addEventListener("abort", finish, { once: true });
  });
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Durum ucunu aralıklarla sorar. Model çağırmaz, kira almaz. İlk soru bir aralık sonra: üretim
 * zaten akıyorsa boşuna sorulmasın. `published` gelince `{examId}` ile biter; durdurulunca `null`.
 * `failed`/`running` yalnız `onState`e bildirilir — ne yapılacağına çağıran karar verir.
 */
export function pollMockExamStatus(
  ids: MockStatusIds | (() => MockStatusIds),
  onState: (status: MockExamStatus) => void,
  options: { intervalMs?: number; fetchImpl?: FetchLike; signal?: AbortSignal; maxMs?: number } = {},
): { done: Promise<{ examId: string } | null>; stop: () => void } {
  const controller = new AbortController();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener("abort", () => controller.abort(), { once: true });
  const intervalMs = options.intervalMs ?? MOCK_STATUS_INTERVAL_MS;
  const maxMs = options.maxMs ?? MOCK_STATUS_MAX_MS;
  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const started = Date.now();
  const done = (async () => {
    for (;;) {
      await abortableWait(intervalMs, controller.signal);
      if (controller.signal.aborted || Date.now() - started >= maxMs) return null;
      let status: MockExamStatus = { state: "unknown" };
      try {
        const current = typeof ids === "function" ? ids() : ids;
        const res = await fetchImpl(mockStatusUrl(current), { cache: "no-store", signal: controller.signal });
        if (res.ok) status = parseMockExamStatus(await res.json().catch(() => null));
      } catch {
        // Ağ hatası: bir sonraki aralıkta yeniden sorulur.
      }
      if (controller.signal.aborted) return null;
      if (status.state !== "unknown") onState(status);
      if (status.state === "published") return { examId: status.examId };
    }
  })();
  return { done, stop: () => controller.abort() };
}

export type MockStatusWatch = {
  ids: MockStatusIds | (() => MockStatusIds);
  intervalMs?: number;
  fetchImpl?: FetchLike;
  onState?: (status: MockExamStatus) => void;
  /** POST akışı kâğıdın kimliğini öğrenince: çağıran tarayıcıya yazar, yenilemede yoklama sürsün. */
  onResume?: (resumeId: string) => void;
};

/**
 * Kurulum isteği: ilerleme satırlarını `onProgress`'e verir, sonucu döndürür. Üretim düşüşünde bir kez
 * kendiliğinden yeniden ister (`postJsonWithRetry` ile aynı kural). Ağ hatası fırlatılır.
 *
 * `options.status` verilirse durum yoklaması POST döngüsüne paralel koşar: `published` gelince süren
 * POST iptal edilir, döngü biter ve sonuç `{examId}` ile döner. Dönüş tipi değişmez.
 */
export async function postMockExamWithProgress(
  url: string,
  body: () => unknown,
  onProgress: (progress: MockExamProgress) => void,
  options: { delayMs?: number; pollMs?: number; status?: MockStatusWatch } = {},
): Promise<{ status: number; data: Record<string, unknown> }> {
  let resumeId: string | null = null;
  const setResume = (id: string) => {
    if (resumeId === id) return;
    resumeId = id;
    options.status?.onResume?.(id);
  };
  let floor: MockExamProgress | null = null;
  const emit = (progress: MockExamProgress) => {
    const next = monotonicProgress(floor, progress);
    if (!next) return;
    floor = next;
    if (next === progress) onProgress(next);
  };
  const abort = new AbortController();
  let published: { examId: string } | null = null;
  const statusWatch = options.status;
  const watch = statusWatch
    ? pollMockExamStatus(
        () => {
          const base = typeof statusWatch.ids === "function" ? statusWatch.ids() : statusWatch.ids;
          return { ...base, resumeId: base.resumeId ?? resumeId };
        },
        (state) => statusWatch.onState?.(state),
        { intervalMs: statusWatch.intervalMs, fetchImpl: statusWatch.fetchImpl },
      )
    : null;
  if (watch) {
    void watch.done.then((hit) => {
      if (!hit) return;
      published = hit;
      abort.abort();
    });
  }

  const once = async () => {
    const base = (body() ?? {}) as Record<string, unknown>;
    const payload = resumeId ? { ...base, resumeId } : base;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
      body: JSON.stringify(payload),
      signal: abort.signal,
    });
    if (!res.body || !(res.headers.get("content-type") ?? "").includes("ndjson")) {
      const data = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
      if (typeof data.resumeId === "string") setResume(data.resumeId);
      return { status: res.status, data };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let final: Extract<MockStreamLine, { type: "done" }> | null = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      const split = splitNdjson(done ? `${buffer}\n` : buffer);
      buffer = split.rest;
      for (const line of split.lines) {
        if (line.type === "progress") {
          if (line.resumeId) setResume(line.resumeId);
          emit({ done: line.done, total: line.total, label: line.label ?? null });
        } else if (line.type === "done") final = line;
      }
      if (done) break;
    }
    if (final) {
      if (typeof final.data.resumeId === "string") setResume(final.data.resumeId);
      return { status: final.status, data: final.data };
    }
    return { status: 500, data: { code: "generation_failed", ...(resumeId ? { resumeId } : {}) } };
  };

  const wait = (ms: number) => abortableWait(ms, abort.signal);
  const publishedResult = () => {
    const examId = published?.examId ?? "";
    return { status: 200, data: { ok: true, examId, ...(resumeId ? { resumeId } : {}) } as Record<string, unknown> };
  };
  let freshRetries = 0;
  let runningPolls = 0;
  let chunkSteps = 0;
  let streamErrors = 0;
  let last: { status: number; data: Record<string, unknown> } = { status: 500, data: { code: "generation_failed" } };
  try {
    while (chunkSteps <= 48) {
      if (published) return publishedResult();
      try {
        last = await once();
      } catch (error) {
        if (published) return publishedResult();
        if (!resumeId) throw error;
        streamErrors += 1;
        if (streamErrors > 8) throw error;
        await wait(options.delayMs ?? AUTO_RETRY_DELAY_MS);
        continue;
      }
      if (published) return publishedResult();
      if (typeof last.data.resumeId === "string") setResume(last.data.resumeId);
      if (resumeId && typeof last.data.resumeId !== "string") last = { ...last, data: { ...last.data, resumeId } };
      if (last.status < 300 && last.data.examId) return last;
      if (last.status < 300 && last.data.resumeId && !last.data.examId) {
        if (last.data.running === true) {
          runningPolls += 1;
          if (runningPolls > 180) return last;
          await wait(options.pollMs ?? 2000);
          continue;
        }
        runningPolls = 0;
        chunkSteps += 1;
        if (chunkSteps > 48) return last;
        await wait(options.delayMs ?? 40);
        continue;
      }
      const code = last.data.code ?? last.data.error;
      if (!isRetryableFailure(last.status, code)) return last;
      if (resumeId) {
        chunkSteps += 1;
        if (chunkSteps > 48) return last;
        await wait(options.delayMs ?? AUTO_RETRY_DELAY_MS);
        continue;
      }
      if (freshRetries >= 1) return last;
      freshRetries += 1;
      await wait(options.delayMs ?? AUTO_RETRY_DELAY_MS);
    }
    if (published) return publishedResult();
    return last;
  } finally {
    watch?.stop();
  }
}

/** Arka plan işi bitene kadar yalnız ilerleme. Ağ hatası fırlatılır. Süren iş başarısız sayılmaz. */
export async function pollGenerationJob(
  jobId: string,
  onProgress: (progress: MockExamProgress) => void,
  options?: { waitMs?: number; maxMs?: number },
): Promise<{ examId?: string; failed?: boolean }> {
  const waitMs = options?.waitMs ?? 2000;
  const maxMs = options?.maxMs ?? 12 * 60 * 1000;
  const started = Date.now();
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const res = await fetch(`/api/learning/jobs/${jobId}`, { cache: "no-store" });
    if (!res.ok) throw new Error("job_poll_failed");
    const data = (await res.json().catch(() => ({}))) as {
      state?: string;
      examId?: string | null;
      progress?: { ready?: number; promised?: number };
    };
    const ready = data.progress?.ready ?? 0;
    const promised = data.progress?.promised ?? 0;
    onProgress({ done: ready, total: promised || ready, label: null });
    if (data.state === "done" && data.examId) return { examId: data.examId };
    if (data.state === "failed") return { failed: true };
    if (Date.now() - started >= maxMs) return {};
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  return {};
}

/** NDJSON gövdesini satır satır okur; tam satırları döndürür, yarım kalanı biriktirir. */
export function splitNdjson(buffer: string): { lines: MockStreamLine[]; rest: string } {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  const lines: MockStreamLine[] = [];
  for (const part of parts) {
    const text = part.trim();
    if (!text) continue;
    try {
      lines.push(JSON.parse(text) as MockStreamLine);
    } catch {
      // Bozuk satır atlanır; son satır sonucu taşır.
    }
  }
  return { lines, rest };
}

/* ------------------------------------------------------------------------------------------------
 * Durum kararı — `practice_exams` satırlarından (durum ucu bunu çağırır; model yok, kira yok)
 * ---------------------------------------------------------------------------------------------- */

export type MockStatusRow = {
  id: string;
  blueprint: unknown;
  /** Yalnız `cpBuild` taşımayan satır için okunur (arka plan işinin yazdığı kâğıt). */
  questionCount?: number | null;
};

type BuildLite = {
  examId: string | null;
  building: boolean;
  failed: boolean;
  failError: string | null;
  leaseUntil: number;
  topicsReady: number;
  topicTotal: number;
};

/** `fallback-exam.ts`'in `readBuild`inin okuma amaçlı küçük kopyası: yalnız durum alanları. */
export function readMockBuildLite(blueprint: unknown): BuildLite | null {
  const host = blueprint && typeof blueprint === "object" ? (blueprint as Record<string, unknown>) : null;
  const raw = host?.cpBuild && typeof host.cpBuild === "object" ? (host.cpBuild as Record<string, unknown>) : null;
  if (!raw || typeof raw.v !== "number") return null;
  const attempted = Array.isArray(raw.topicsAttempted) ? raw.topicsAttempted.filter((item) => typeof item === "string") : [];
  const topicTotal = typeof raw.topicTotal === "number" ? raw.topicTotal : 0;
  return {
    examId: typeof raw.examId === "string" ? raw.examId : null,
    building: raw.building !== false,
    failed: raw.failed === true,
    failError: typeof raw.failError === "string" ? raw.failError : null,
    leaseUntil: typeof raw.leaseUntil === "number" ? raw.leaseUntil : 0,
    topicsReady: topicTotal > 0 ? Math.min(topicTotal, new Set(attempted).size) : new Set(attempted).size,
    topicTotal,
  };
}

/**
 * Satırlar yeniden eskiye sıralı gelir. Yayımlanmış kâğıt her şeyden önce gelir: öğrencinin sınavı
 * hazır. Sonra sorulan kâğıt (`resumeId`), sonra en yeni süren kâğıt. "Başka ayarla açılıp
 * bırakılan" (`abandoned`) kâğıt bu isteğin kâğıdı değildir, sayılmaz. Hiçbir kayıt yoksa POST henüz
 * satırı açmamıştır: `running`.
 */
export function mockExamStatusFromRows(
  rows: MockStatusRow[],
  options: { now: number; resumeId?: string | null },
): MockExamStatus {
  const own = options.resumeId ? rows.find((row) => row.id === options.resumeId) : undefined;
  const builds = rows.map((row) => ({ row, build: readMockBuildLite(row.blueprint) }));
  for (const { row, build } of builds) {
    if (!build) {
      if ((row.questionCount ?? 0) > 0) return { state: "published", examId: row.id };
      continue;
    }
    if (build.examId && !build.building) return { state: "published", examId: build.examId, resumeId: row.id };
  }
  const describe = (row: MockStatusRow, build: BuildLite): MockExamStatus => {
    if (build.failed) return { state: "failed", resumeId: row.id, code: build.failError ?? undefined };
    return {
      state: "running",
      resumeId: row.id,
      leaseAlive: build.leaseUntil > options.now,
      topicsReady: build.topicsReady,
      topicTotal: build.topicTotal,
    };
  };
  if (own) {
    const build = readMockBuildLite(own.blueprint);
    if (build && build.failError !== "abandoned") return describe(own, build);
  }
  const newest = builds.find(({ build }) => build && build.failError !== "abandoned");
  if (newest?.build) return describe(newest.row, newest.build);
  return { state: "running" };
}

/* ------------------------------------------------------------------------------------------------
 * Tarayıcı kaydı — sayfa yenilenince yoklama sürsün
 * ---------------------------------------------------------------------------------------------- */

export type StoredMockRun = {
  startedAt: string;
  resumeId?: string | null;
  jobId?: string | null;
  answerMode?: "app" | "paper" | null;
  /** Kurulumun gövdesi: devralma aynı ayarla gider, yoksa başka ayarlı yeni kâğıt (ikinci ücret) açılırdı. */
  body?: Record<string, unknown> | null;
};

/** Bu yaştan eski kayıt sürdürülmez (sunucunun 15 dakikalık bayatlık sınırıyla aynı). */
export const STORED_MOCK_RUN_MAX_AGE_MS = 15 * 60 * 1000;

export function mockRunStorageKey(prepId: string): string {
  return `cp:mock-exam:${prepId}`;
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function readStoredMockRun(prepId: string, now = Date.now()): StoredMockRun | null {
  try {
    const raw = storage()?.getItem(mockRunStorageKey(prepId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredMockRun>;
    if (typeof parsed.startedAt !== "string") return null;
    const started = Date.parse(parsed.startedAt);
    if (!Number.isFinite(started) || now - started > STORED_MOCK_RUN_MAX_AGE_MS || started > now + 60_000) return null;
    return {
      startedAt: parsed.startedAt,
      resumeId: typeof parsed.resumeId === "string" ? parsed.resumeId : null,
      jobId: typeof parsed.jobId === "string" ? parsed.jobId : null,
      answerMode: parsed.answerMode === "paper" ? "paper" : parsed.answerMode === "app" ? "app" : null,
      body: parsed.body && typeof parsed.body === "object" ? parsed.body : null,
    };
  } catch {
    return null;
  }
}

export function writeStoredMockRun(prepId: string, run: StoredMockRun): void {
  try {
    storage()?.setItem(mockRunStorageKey(prepId), JSON.stringify(run));
  } catch {
    // Özel pencere ya da dolu depo: yenilemede yoklama sürmez, ekran yine çalışır.
  }
}

export function clearStoredMockRun(prepId: string): void {
  try {
    storage()?.removeItem(mockRunStorageKey(prepId));
  } catch {
    // Silinemeyen kayıt 15 dakikada kendiliğinden bayatlar.
  }
}
