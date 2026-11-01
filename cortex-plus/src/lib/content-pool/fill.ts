/**
 * Ortak havuz toplu doldurucu (1 Kasım 2026). Öğrenci isteğiyle aynı read-through hattını (getUnitContent)
 * sunucuda sırayla çalıştırır: aynı kilit (draft satırı), aynı doğrulama, aynı maliyet kaydı.
 * Saf mantık burada (sınanır); Supabase ve rota ayrı.
 */

export type FillGroup = "TYT" | "LGS" | "AYT";
export type FillProgram = { id: string; kind: string; units: { title: string; outcomes: { grade?: number | null }[] }[] };
export type FillTarget = { unitId: string; programId: string; group: FillGroup };

/** Sıra Burhan'ın onayından (t235u): TYT dersleri, sonra LGS, sonra AYT. */
export const TYT_PROGRAMS = ["matematik", "tde", "fizik", "kimya", "biyoloji", "cografya", "felsefe", "dkab"].map((s) => `yks-2026-${s}`);
export const AYT_EXTRA_PROGRAMS = ["tarih", "inkilap", "mantik", "psikoloji", "sosyoloji"].map((s) => `yks-2026-${s}`);
export const LGS_PREFIX = "lgs-2027-";

/** Ünitenin sınıfı: kazanımlarındaki en yüksek sınıf; hiçbirinde yoksa null. */
export function unitGrade(unit: FillProgram["units"][number]): number | null {
  const grades = unit.outcomes.map((o) => o.grade).filter((g): g is number => typeof g === "number");
  return grades.length ? Math.max(...grades) : null;
}

function targets(program: FillProgram, group: FillGroup, keep: (grade: number | null) => boolean): FillTarget[] {
  return program.units.flatMap((unit, i) =>
    unit.outcomes.length > 0 && keep(unitGrade(unit)) ? [{ unitId: `${program.id}#${i + 1}`, programId: program.id, group }] : [],
  );
}

/** Doldurma sırası: TYT (9–10. sınıf) → LGS → AYT (11–12. sınıf ya da sınıfsız). Aynı ünite iki kez girmez. */
export function fillOrder(programs: FillProgram[]): FillTarget[] {
  const byId = new Map(programs.map((p) => [p.id, p]));
  const isTyt = (g: number | null) => g === 9 || g === 10;
  const out: FillTarget[] = [];
  for (const id of TYT_PROGRAMS) { const p = byId.get(id); if (p) out.push(...targets(p, "TYT", isTyt)); }
  for (const p of programs.filter((p) => p.id.startsWith(LGS_PREFIX)).sort((a, b) => a.id.localeCompare(b.id))) out.push(...targets(p, "LGS", () => true));
  for (const id of [...TYT_PROGRAMS, ...AYT_EXTRA_PROGRAMS]) { const p = byId.get(id); if (p) out.push(...targets(p, "AYT", (g) => !isTyt(g))); }
  const seen = new Set<string>();
  return out.filter((t) => (seen.has(t.unitId) ? false : (seen.add(t.unitId), true)));
}

export const DEFAULT_CAP_USD = 5.33;
/** Bir ünitenin ölçülen maliyeti ~0,0063 $; güvenli tarafta kalmak için tahmin bundan yüksek tutulur. */
export const DEFAULT_UNIT_ESTIMATE_USD = 0.012;
/** Bir ünite en fazla bu kadar kez başarısız olur (ilk deneme + 1 yeniden deneme), sonra atlanır. */
export const MAX_FAILED_ATTEMPTS = 2;

export type UnitState = { verified: boolean; failedAttempts: number };
export type FillOutcome = "generated" | "hit" | "pending" | "failed" | "not_found";

export type FillDeps = {
  /** Havuzdaki durum (doğrulanmış mı, kaç kez reddedildi). */
  states(unitIds: string[]): Promise<Map<string, UnitState>>;
  /** Veritabanındaki toplam SHARED_CONTENT harcaması (USD). */
  spent(): Promise<number>;
  /** Kill switch: her ünite öncesi okunur. */
  enabled(): Promise<boolean>;
  run(unitId: string): Promise<FillOutcome>;
  now(): number;
  log?(event: string, data: Record<string, unknown>): void;
};

export type FillOptions = { capUsd: number; unitEstimateUsd: number; concurrency: number; deadline: number };
export type FillReport = {
  done: string[];
  failed: string[];
  pending: string[];
  skippedFailed: string[];
  stop: "complete" | "budget" | "disabled" | "deadline";
  spentUsd: number;
  remaining: number;
};

/**
 * Eksik üniteleri sırayla, küçük eşzamanlılıkla üretir. Her ünite öncesi: kill switch ve veritabanı harcaması
 * yeniden okunur; harcama + uçuştaki ünitelerin tahmini + bu ünitenin tahmini tavanı aşacaksa durur.
 * Başarısız ünite bu çalışmada bir kez daha denenir; toplam MAX_FAILED_ATTEMPTS'a ulaşan atlanır.
 */
export async function runFill(order: FillTarget[], deps: FillDeps, opts: FillOptions): Promise<FillReport> {
  const states = await deps.states(order.map((t) => t.unitId));
  const skippedFailed: string[] = [];
  const queue: { unitId: string; attempts: number }[] = [];
  for (const t of order) {
    const s = states.get(t.unitId) ?? { verified: false, failedAttempts: 0 };
    if (s.verified) continue;
    if (s.failedAttempts >= MAX_FAILED_ATTEMPTS) { skippedFailed.push(t.unitId); continue; }
    queue.push({ unitId: t.unitId, attempts: s.failedAttempts });
  }
  const report: FillReport = { done: [], failed: [], pending: [], skippedFailed, stop: "complete", spentUsd: 0, remaining: 0 };
  let inFlight = 0;
  let stop: FillReport["stop"] | null = null;
  // Kontrol ve ayırma sıralı yapılır; iki işçi aynı bütçe payını göremez.
  let gate: Promise<void> = Promise.resolve();
  const admit = (): Promise<{ unitId: string; attempts: number } | null> => {
    const next = gate.then(async () => {
      if (stop || !queue.length) return null;
      if (deps.now() >= opts.deadline) { stop = "deadline"; return null; }
      if (!(await deps.enabled())) { stop = "disabled"; return null; }
      const spent = await deps.spent();
      report.spentUsd = spent;
      if (spent + (inFlight + 1) * opts.unitEstimateUsd > opts.capUsd) { stop = "budget"; return null; }
      inFlight += 1;
      return queue.shift()!;
    });
    gate = next.then(() => undefined, () => undefined);
    return next;
  };
  const worker = async () => {
    for (let job = await admit(); job; job = await admit()) {
      let outcome: FillOutcome;
      try { outcome = await deps.run(job.unitId); } catch { outcome = "failed"; }
      inFlight -= 1;
      if (outcome === "generated" || outcome === "hit") report.done.push(job.unitId);
      else if (outcome === "pending") report.pending.push(job.unitId);
      else if (outcome === "failed") {
        const attempts = job.attempts + 1;
        deps.log?.("pool_fill_unit_failed", { unitId: job.unitId, attempts });
        if (attempts < MAX_FAILED_ATTEMPTS) queue.push({ unitId: job.unitId, attempts });
        else { report.failed.push(job.unitId); report.skippedFailed.push(job.unitId); }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency) }, worker));
  report.stop = stop ?? "complete";
  report.remaining = queue.length;
  report.spentUsd = await deps.spent().catch(() => report.spentUsd);
  return report;
}
