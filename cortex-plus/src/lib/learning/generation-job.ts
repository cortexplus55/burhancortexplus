/**
 * Üretim işi: bir parça, sonra kira. Süre dolunca kaldığı yerden sürer.
 * Bütçe tükenince iade tam bir kez. İkinci ücret yok.
 */

export const JOB_BUDGET_MS = 10 * 60 * 1000;
export const JOB_LEASE_MS = 60_000;

export type JobPhase = "queued" | "running" | "done" | "failed";

export type PureJob<T> = {
  state: JobPhase;
  leaseUntil: number | null;
  chargeReservationId: string | null;
  refunded: boolean;
  startedAt: number;
  attempts: number;
  ready: number;
  promised: number;
  items: T[];
  resultRef: string | null;
  charges: number;
};

export function freshJob<T>(promised: number): PureJob<T> {
  return {
    state: "queued",
    leaseUntil: null,
    chargeReservationId: null,
    refunded: false,
    startedAt: 0,
    attempts: 0,
    ready: 0,
    promised,
    items: [],
    resultRef: null,
    charges: 0,
  };
}

export function openJob<T>(job: PureJob<T>, input: { now: number; charge: () => string }): PureJob<T> {
  if (job.chargeReservationId) return job;
  if (job.state === "done" || job.state === "failed") return job;
  const chargeReservationId = input.charge();
  return {
    ...job,
    chargeReservationId,
    charges: job.charges + 1,
    state: "running",
    startedAt: input.now,
    ready: job.ready,
  };
}

export async function pumpJob<T>(
  job: PureJob<T>,
  input: {
    now: number;
    budgetMs?: number;
    leaseMs?: number;
    generate: (items: T[]) => Promise<{ items: T[]; done: boolean; resultRef?: string | null; promised?: number }>;
    refund: (reservationId: string) => void;
  },
): Promise<PureJob<T>> {
  if (job.state === "done" || job.state === "failed") return job;
  if (job.state === "running" && job.leaseUntil != null && job.leaseUntil > input.now) return job;
  const budgetMs = input.budgetMs ?? JOB_BUDGET_MS;
  const leaseMs = input.leaseMs ?? JOB_LEASE_MS;
  const startedAt = job.startedAt > 0 ? job.startedAt : input.now;
  let next: PureJob<T> = {
    ...job,
    state: "running",
    startedAt,
    attempts: job.attempts + 1,
    leaseUntil: input.now + leaseMs,
  };
  try {
    const produced = await input.generate(job.items);
    const promised = produced.promised && produced.promised > 0 ? produced.promised : job.promised;
    const ready = Math.max(job.ready, Math.min(promised > 0 ? promised : produced.items.length, produced.items.length));
    next = {
      ...next,
      items: produced.items,
      ready,
      promised,
      resultRef: produced.resultRef ?? job.resultRef,
    };
    // Bitti, ancak kayıt da bittiyse. Dolu liste tek başına yayımlanmaz.
    if (produced.done) {
      return {
        ...next,
        state: "done",
        ready: promised > 0 ? promised : ready,
        leaseUntil: null,
        resultRef: produced.resultRef ?? next.resultRef,
      };
    }
  } catch {
    next = { ...next, items: job.items, ready: job.ready };
  }
  if (input.now - startedAt >= budgetMs) {
    if (!next.refunded && next.chargeReservationId) {
      input.refund(next.chargeReservationId);
      next = { ...next, refunded: true };
    }
    return { ...next, state: "failed", leaseUntil: null };
  }
  return next;
}
