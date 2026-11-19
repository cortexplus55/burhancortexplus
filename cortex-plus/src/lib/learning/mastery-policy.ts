/**
 * Akıllı kavrama politikası (Faz 4 / ADIM 2, 19 Kasım 2026, Burhan'ın kararı t307u). Konu kararının TEK kaynağı:
 * eşikler, kaynak ağırlıkları, sönüm, son yanlış cezası ve rozet buradan okunur. Saf modül (istemci de okur).
 *
 * Formül:
 *   decay = 0,5^(yaşGün / 14)
 *   etkinAğırlık = kaynakAğırlığı × decay × (tekrarDoğrusu ? 0,4 : 1)   — yeni yanlış her zaman tam (1,0 çarpan)
 *   hamYüzde = round(Σ doğruEA / Σ toplamEA × 100)
 *   düzeltilmişYüzde = max(0, hamYüzde − sonYanlışSayısı × 8)
 *
 * Rozet: Öğrendin (zümrüt) / Gelişiyor (kobalt) / Zayıf (mercan) / Ölçülmedi (gri).
 *   Ölçüldü: en az 3 kanıt (MASTERY_EVIDENCE_FLOOR).
 *   Öğrendin: ölçüldü + en az 1 nesnel kaynak + ipucusuz en az 4 doğru + en az 2 ayrı değerlendirme adımı (takvim günü
 *   şartı yok) + düzeltilmiş yüzde hedefte (yoksa 70). Kartlar tek başına Öğrendin açamaz.
 *   Gelişiyor: ölçüldü, Öğrendin değil, düzeltilmiş yüzde ≥ 55. Altı Zayıf.
 *
 * Öğrenciye kod adı (kaynak türü, iç sinyal adı) gösterilmez: ekran yalnız rozet, yüzde ve sabit metinleri okur.
 */

export const MASTERY_EVIDENCE_FLOOR = 3;
export const DEFAULT_TARGET_SCORE = 70;
/** Altı "Zayıf". */
export const DEVELOPING_MIN_SCORE = 55;
export const LEARNED_MIN_INDEPENDENT_CORRECT = 4;
/** Ayrı değerlendirme adımı (ör. ders içi sorular + konu testi); takvim günü şartı yok. */
export const LEARNED_MIN_DISTINCT_ATTEMPTS = 2;
export const RETAKE_CORRECT_WEIGHT = 0.4;
export const RECENT_WINDOW = 5;
export const RECENT_MISS_PENALTY_POINTS = 8;
export const EVIDENCE_HALF_LIFE_DAYS = 14;

export const EVIDENCE_WEIGHT = {
  quiz: 1.0,
  written_exam: 1.0,
  oral: 1.0,
  true_false: 0.7,
  lesson_check: 0.7,
  podcast: 0.6,
  card_knew: 0.5,
  card_hard: 0.2,
  card_miss: 0.5,
} as const;

export type PolicySource = keyof typeof EVIDENCE_WEIGHT;

/** Nesnel kaynaklar (öz bildirim değil). Kartlar öz bildirimdir. */
export const OBJECTIVE_SOURCES: ReadonlySet<PolicySource> = new Set<PolicySource>([
  "quiz",
  "written_exam",
  "oral",
  "true_false",
  "lesson_check",
  "podcast",
]);

export const CARD_SOURCES: ReadonlySet<PolicySource> = new Set<PolicySource>(["card_knew", "card_hard", "card_miss"]);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Kayıttaki kaynak türü → politika kaynağı. Konu testi ailesindeki düğümler (test, zayıf nokta, karma, odaklı, final)
 * "quiz" ağırlığıyla sayılır.
 */
export function policySource(sourceKind: string | null | undefined): PolicySource {
  const kind = String(sourceKind ?? "").trim();
  if (kind in EVIDENCE_WEIGHT) return kind as PolicySource;
  return "quiz";
}

export type PolicyEvidence = {
  sourceKind: string;
  correct: boolean;
  hintAssisted: boolean;
  isFirstAttempt: boolean;
  /** Değerlendirme adımının kimliği (deneme kaydı); yoksa kaynak + zaman. */
  attemptId: string | null;
  createdAt: string;
};

export type MasteryBadge = "learned" | "developing" | "weak" | "unmeasured";
export type GuidanceSignal = "illusion_of_competence" | "fragile_mastery";

/** Kayıtlı politika kararı (`exam_prep_topic_mastery.policy`). Rozet okurken hedefle yeniden değerlendirilir. */
export type TopicPolicy = {
  version: 1;
  /** Düzeltilmiş yüzde (ekrandaki sayı). */
  pct: number;
  rawPct: number;
  measured: boolean;
  evidenceCount: number;
  objectiveCount: number;
  independentCorrect: number;
  distinctAttempts: number;
  recentMisses: number;
  hintAssisted: number;
  cards: { knew: number; hard: number; miss: number };
  guidance: GuidanceSignal | null;
};

export function evidenceDecay(ageDays: number): number {
  return Math.pow(0.5, Math.max(0, ageDays) / EVIDENCE_HALF_LIFE_DAYS);
}

/** Tek kanıtın etkin ağırlığı. Tekrar doğrusu (ilk deneme olmayan doğru) 0,4 ile çarpılır; yanlış tam sayılır. */
export function effectiveWeight(row: PolicyEvidence, now: Date): number {
  const source = policySource(row.sourceKind);
  const created = Date.parse(row.createdAt);
  const ageDays = Number.isFinite(created) ? (now.getTime() - created) / DAY_MS : 0;
  const retakeCorrect = row.correct && !row.isFirstAttempt;
  return EVIDENCE_WEIGHT[source] * evidenceDecay(ageDays) * (retakeCorrect ? RETAKE_CORRECT_WEIGHT : 1);
}

function attemptKey(row: PolicyEvidence): string {
  return row.attemptId ? `a:${row.attemptId}` : `s:${policySource(row.sourceKind)}:${row.createdAt}`;
}

/** Konunun kanıtlarından politika kararı (rozet hariç sayılar). */
export function computeTopicPolicy(evidence: readonly PolicyEvidence[], now: Date = new Date()): TopicPolicy {
  // Kronolojik sıra (aynı anda yazılanlar geldiği sırada).
  const rows = evidence
    .map((row, order) => ({ row, order, at: Date.parse(row.createdAt) || 0 }))
    .sort((a, b) => a.at - b.at || a.order - b.order)
    .map((item) => item.row);

  let correctWeight = 0;
  let totalWeight = 0;
  let objectiveCount = 0;
  let independentCorrect = 0;
  let hintAssisted = 0;
  const attempts = new Set<string>();
  const cards = { knew: 0, hard: 0, miss: 0 };
  for (const row of rows) {
    const source = policySource(row.sourceKind);
    if (source === "card_knew") cards.knew += 1;
    else if (source === "card_hard") cards.hard += 1;
    else if (source === "card_miss") cards.miss += 1;
    if (row.hintAssisted) {
      // İpuçlu cevap bağımsız kanıt değildir: yüzdeye girmez, kırılgan kavrama sinyaline girer.
      hintAssisted += 1;
      continue;
    }
    const weight = effectiveWeight(row, now);
    totalWeight += weight;
    if (row.correct) correctWeight += weight;
    if (OBJECTIVE_SOURCES.has(source)) {
      objectiveCount += 1;
      attempts.add(attemptKey(row));
      if (row.correct) independentCorrect += 1;
    }
  }

  const rawPct = totalWeight > 0 ? Math.round((correctWeight / totalWeight) * 100) : 0;
  // Son yanlışlar: son 5 nesnel (ipucusuz) cevaptaki yanlış sayısı.
  const recentObjective = rows.filter((row) => !row.hintAssisted && OBJECTIVE_SOURCES.has(policySource(row.sourceKind))).slice(-RECENT_WINDOW);
  const recentMisses = recentObjective.filter((row) => !row.correct).length;
  const pct = Math.max(0, Math.min(100, rawPct - recentMisses * RECENT_MISS_PENALTY_POINTS));
  const evidenceCount = rows.length;
  const measured = evidenceCount >= MASTERY_EVIDENCE_FLOOR;

  // Yeterlilik yanılsaması: kartta çoğunlukla "Bildim" ama ders içi soruda ya da testte (son pencerede) yanlış.
  const cardMarks = cards.knew + cards.hard + cards.miss;
  const mostlyKnew = cards.knew > 0 && cards.knew > cardMarks - cards.knew;
  const trapMiss = recentObjective.some((row) => {
    const source = policySource(row.sourceKind);
    return !row.correct && (source === "lesson_check" || source === "quiz");
  });
  // Kırılgan kavrama: sorular doğru ama yoğun "Zorlandım" ya da ipuçlu cevap.
  const objectiveMostlyRight = objectiveCount > 0 && independentCorrect / objectiveCount >= DEVELOPING_MIN_SCORE / 100;
  const heavyHard = cards.hard >= 2 && cards.hard >= cardMarks - cards.hard;
  const heavyHints = hintAssisted >= 2 && hintAssisted * 3 >= objectiveCount + hintAssisted;
  let guidance: GuidanceSignal | null = null;
  if (mostlyKnew && trapMiss) guidance = "illusion_of_competence";
  else if (objectiveMostlyRight && (heavyHard || heavyHints)) guidance = "fragile_mastery";

  return {
    version: 1,
    pct,
    rawPct,
    measured,
    evidenceCount,
    objectiveCount,
    independentCorrect,
    distinctAttempts: attempts.size,
    recentMisses,
    hintAssisted,
    cards,
    guidance,
  };
}

function finiteTarget(target: number | null | undefined): number {
  if (target == null || !Number.isFinite(target)) return DEFAULT_TARGET_SCORE;
  return Math.max(0, Math.min(100, Math.round(target)));
}

/** Rozet: kayıtlı sayılar + bugünkü hedef (hedef değişirse rozet de değişir). */
export function policyBadge(policy: TopicPolicy | null | undefined, target: number | null | undefined): MasteryBadge {
  if (!policy || !policy.measured) return "unmeasured";
  const learned =
    policy.objectiveCount >= 1 &&
    policy.independentCorrect >= LEARNED_MIN_INDEPENDENT_CORRECT &&
    policy.distinctAttempts >= LEARNED_MIN_DISTINCT_ATTEMPTS &&
    policy.pct >= finiteTarget(target);
  if (learned) return "learned";
  return policy.pct >= DEVELOPING_MIN_SCORE ? "developing" : "weak";
}

export const BADGE_LABEL: Record<MasteryBadge, string> = {
  learned: "Öğrendin",
  developing: "Gelişiyor",
  weak: "Zayıf",
  unmeasured: "Ölçülmedi",
};

/** Rozet tonu (renk: zümrüt / kobalt / mercan / nötr gri). CSS sınıfı `cp-badge--<ton>`. */
export const BADGE_TONE: Record<MasteryBadge, "emerald" | "cobalt" | "coral" | "gray"> = {
  learned: "emerald",
  developing: "cobalt",
  weak: "coral",
  unmeasured: "gray",
};

/** Yeterlilik yanılsaması uyarısı (spesifikasyon metni, harfiyen). */
export const ILLUSION_OF_COMPETENCE_LINE =
  "Bu konuyu bildiğini düşünüyorsun ama testteki çeldirici noktalarda hata yaptın. 2 dakikalık ücretsiz hedefli tekrarla bu tuzağı kapatalım.";

/** Kırılgan kavrama önerisi: kısa pekiştirme turu. */
export const FRAGILE_MASTERY_LINE =
  "Soruları doğru çözüyorsun ama zorlanarak ya da ipucuyla. Kısa bir ücretsiz pekiştirme turuyla bu bilgiyi sağlamlaştıralım.";

export function guidanceLine(signal: GuidanceSignal | null | undefined): string | null {
  if (signal === "illusion_of_competence") return ILLUSION_OF_COMPETENCE_LINE;
  if (signal === "fragile_mastery") return FRAGILE_MASTERY_LINE;
  return null;
}

/** Kayıttan okunan politika (bozuk ya da eski satır → null). */
export function readTopicPolicy(value: unknown): TopicPolicy | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.version !== 1) return null;
  const num = (key: string) => {
    const n = Number(row[key]);
    return Number.isFinite(n) ? n : 0;
  };
  const cards = (row.cards && typeof row.cards === "object" ? row.cards : {}) as Record<string, unknown>;
  const guidance = row.guidance === "illusion_of_competence" || row.guidance === "fragile_mastery" ? row.guidance : null;
  return {
    version: 1,
    pct: Math.max(0, Math.min(100, Math.round(num("pct")))),
    rawPct: Math.max(0, Math.min(100, Math.round(num("rawPct")))),
    measured: row.measured === true,
    evidenceCount: num("evidenceCount"),
    objectiveCount: num("objectiveCount"),
    independentCorrect: num("independentCorrect"),
    distinctAttempts: num("distinctAttempts"),
    recentMisses: num("recentMisses"),
    hintAssisted: num("hintAssisted"),
    cards: { knew: Number(cards.knew) || 0, hard: Number(cards.hard) || 0, miss: Number(cards.miss) || 0 },
    guidance,
  };
}
