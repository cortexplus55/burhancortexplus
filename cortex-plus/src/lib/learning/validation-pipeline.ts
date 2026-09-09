/**
 * Stage 7 — ordered validation pipeline for pdf_learning_v2.
 *
 * Order (fail-fast):
 * 1. structural → 2. source → 3. domain → 4. pedagogy
 * Then (caller): 5. repair → 6. recheck → 7. safe outcome
 *
 * Independent (non-LLM) checks are preferred where cheap. A second model
 * call alone is never treated as a correctness guarantee.
 */

export type ValidationStage =
  | "structural"
  | "source"
  | "domain"
  | "pedagogy"
  | "repair"
  | "recheck"
  | "safe_outcome";

export type ValidationIssue = {
  stage: ValidationStage;
  code: string;
  message: string;
};

export type ValidationMetrics = {
  generationMs: number;
  validationMs: number;
  stagesMs: Partial<Record<ValidationStage, number>>;
  failedStage: ValidationStage | null;
  failureCodes: string[];
  repairAttempted: boolean;
  recheckPassed: boolean | null;
  outcome: "accepted" | "rejected" | "validator_unavailable";
};

export type IndependentValidationInput = {
  /** Raw JSON string or object from the model. */
  draft: unknown;
  /** Parsed object when JSON.parse succeeded; null if invalid JSON. */
  parsed: unknown | null;
  /** Deterministic pedagogy / activity-specific issues (Stage 5 validators). */
  pedagogyIssues?: string[];
  /** Declared source page numbers from session / topic map. */
  sourcePages?: number[];
  /** Whether document-backed generation requires non-empty source support. */
  requireSourceSupport?: boolean;
  /** Non-empty source excerpt / block when documents_only. */
  sourceExcerpt?: string;
  /** Expected minimum item count (questions / cards / statements). */
  minItems?: number;
  /** Soft domain: subject hint for heuristic checks. */
  subjectHint?: string;
};

export type IndependentValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
  failedStage: ValidationStage | null;
  stagesMs: Partial<Record<ValidationStage, number>>;
};

const STAGE_ORDER = ["structural", "source", "domain", "pedagogy"] as const;

function issue(
  stage: ValidationStage,
  code: string,
  message: string,
): ValidationIssue {
  return { stage, code, message };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function collectItems(parsed: unknown): unknown[] {
  const row = asRecord(parsed);
  if (!row) return [];
  for (const key of ["questions", "items", "cards", "chapters", "sections"]) {
    if (Array.isArray(row[key])) return row[key] as unknown[];
  }
  return [];
}

function emptyish(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Cheap arithmetic equality: "2+2=4", "3×4=12", "½=0.5" style fragments. */
export function checkSimpleMathClaims(text: string): string[] {
  const issues: string[] = [];
  const eq = /(?<![\d.,\w])([−-]?\d+(?:[.,]\d+)?)\s*([+\-−×x*÷/])\s*([−-]?\d+(?:[.,]\d+)?)\s*=\s*([−-]?\d+(?:[.,]\d+)?)(?![\d.,/])/gi;
  let match: RegExpExecArray | null;
  while ((match = eq.exec(text)) !== null) {
    const number = (value: string) => Number(value.replace("−", "-").replace(",", "."));
    const a = number(match[1]);
    const op = match[2];
    const b = number(match[3]);
    const claimed = number(match[4]);
    if (![a, b, claimed].every((n) => Number.isFinite(n))) continue;
    let expected: number | null = null;
    if (op === "+" || op === "-" || op === "−") expected = op === "+" ? a + b : a - b;
    else if (op === "×" || op === "x" || op === "*") expected = a * b;
    else if (op === "÷" || op === "/") expected = b === 0 ? null : a / b;
    if (expected == null) continue;
    if (Math.abs(expected - claimed) > 1e-6) {
      issues.push(`Hesap uyuşmazlığı: ${a}${op}${b}≠${claimed}`);
    }
  }
  return issues;
}

function uniqueOptionsIssues(parsed: unknown): string[] {
  const issues: string[] = [];
  const items = collectItems(parsed);
  items.forEach((item, index) => {
    const row = asRecord(item);
    if (!row || !Array.isArray(row.options)) return;
    const options = row.options
      .map((o) => String(o ?? "").trim().toLocaleLowerCase("tr-TR"))
      .filter(Boolean);
    if (options.length >= 2 && new Set(options).size !== options.length) {
      issues.push(`Madde ${index + 1}: tekrarlayan şıklar`);
    }
  });
  return issues;
}

function structuralCheck(input: IndependentValidationInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (input.parsed == null) {
    issues.push(issue("structural", "invalid_json", "Çıktı geçerli JSON değil."));
    return issues;
  }
  const row = asRecord(input.parsed);
  if (!row) {
    issues.push(issue("structural", "not_object", "Çıktı bir JSON nesnesi olmalı."));
    return issues;
  }

  const items = collectItems(input.parsed);
  const minItems = input.minItems ?? 0;
  if (minItems > 0 && items.length < minItems) {
    issues.push(
      issue(
        "structural",
        "item_count",
        `En az ${minItems} öğe gerekli; ${items.length} bulundu.`,
      ),
    );
  }

  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "string" && emptyish(value) && key !== "hint") {
      issues.push(issue("structural", "empty_field", `Boş alan: ${key}`));
    }
  }

  for (let i = 0; i < items.length; i += 1) {
    const item = asRecord(items[i]);
    if (!item) {
      issues.push(issue("structural", "empty_item", `Boş öğe #${i + 1}`));
      continue;
    }
    if (Array.isArray(row.chapters)) {
      if (emptyish(item.title) || !Array.isArray(item.lines) || !item.lines.length ||
          item.lines.some((line) => emptyish(asRecord(line)?.text))) {
        issues.push(issue("structural", "empty_content", `Bölüm #${i + 1} başlığı veya konuşması boş.`));
      }
      continue;
    }
    if (Array.isArray(row.sections)) {
      if (emptyish(item.heading) || emptyish(item.body)) {
        issues.push(issue("structural", "empty_content", `Bölüm #${i + 1} başlığı veya anlatımı boş.`));
      }
      continue;
    }
    const text =
      (typeof item.text === "string" && item.text) ||
      (typeof item.prompt === "string" && item.prompt) ||
      (typeof item.front === "string" && item.front) ||
      (typeof item.question === "string" && item.question) ||
      "";
    if (!String(text).trim()) {
      issues.push(issue("structural", "empty_content", `Öğe #${i + 1} metni boş.`));
    }
    if (Array.isArray(item.options)) {
      if (item.options.length < 2) {
        issues.push(
          issue("structural", "option_format", `Öğe #${i + 1}: en az 2 şık gerekli.`),
        );
      }
      if (item.options.some((o) => emptyish(o))) {
        issues.push(
          issue("structural", "option_format", `Öğe #${i + 1}: boş şık var.`),
        );
      }
    }
  }

  return issues;
}

function sourceCheck(input: IndependentValidationInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (input.requireSourceSupport) {
    if (!input.sourceExcerpt?.trim()) {
      issues.push(
        issue(
          "source",
          "source_missing",
          "Kaynak alıntısı yok; documents_only içerik doğrulanamaz.",
        ),
      );
    }
  }
  if (input.sourcePages?.length) {
    const bad = input.sourcePages.filter((n) => !Number.isInteger(n) || n < 1);
    if (bad.length) {
      issues.push(
        issue("source", "invalid_pages", "Kaynak sayfa numaraları geçersiz."),
      );
    }
    const text =
      typeof input.draft === "string"
        ? input.draft
        : JSON.stringify(input.parsed ?? {});
    const cited = [...text.matchAll(/\b(?:sayfa|s\.|p\.)\s*(\d+)\b/gi)].map((m) =>
      Number(m[1]),
    );
    for (const page of cited) {
      if (!input.sourcePages.includes(page)) {
        issues.push(
          issue(
            "source",
            "unsupported_page",
            `Atıf yapılan sayfa kaynak listesinde yok: ${page}`,
          ),
        );
      }
    }
  }
  return issues;
}

/** Soft percent claims like "yüzde 150" / "150%" that cannot be a success rate. */
export function checkImpossiblePercentClaims(text: string): string[] {
  const issues: string[] = [];
  const re = /(?:yüzde|%)\s*(\d{3,})|(\d{3,})\s*%/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const raw = match[1] ?? match[2];
    const value = Number(raw);
    const context = text.slice(Math.max(0, match.index - 35), re.lastIndex + 35);
    if (Number.isFinite(value) && value > 100 && /olasılık|başarı oranı|doğru cevap oranı/i.test(context)) {
      issues.push(`İmkânsız yüzde: ${value}`);
    }
  }
  return issues;
}

/** Wrong propositions, distractors and misconception claims are not assertions. */
function assertionTexts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(assertionTexts);
  const row = asRecord(value);
  if (!row) return [];
  if (typeof row.correct === "boolean") {
    return assertionTexts(row.correct ? row.text : row.correctedStatement);
  }
  return Object.entries(row).flatMap(([key, child]) => {
    if (["claim", "options", "prompt", "question"].includes(key)) return [];
    if (key === "text" && Array.isArray(row.options)) return [];
    return assertionTexts(child);
  });
}

function domainCheck(input: IndependentValidationInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  // A non-JSON draft is used by standalone diagnostic callers.
  const text = typeof input.draft === "string" && !/^[\s]*[\[{]/.test(input.draft)
    ? input.draft : assertionTexts(input.parsed).join("\n");
  for (const msg of checkSimpleMathClaims(text)) {
    issues.push(issue("domain", "math_mismatch", msg));
  }
  for (const msg of uniqueOptionsIssues(input.parsed)) {
    issues.push(issue("domain", "duplicate_options", msg));
  }
  // Lightweight unit clash: "5 kg = 5 g" / "1 mol = 1 g" style nonsense
  if (
    /\b(\d+)\s*kg\s*=\s*\1\s*g\b/i.test(text) ||
    /\b(\d+)\s*g\s*=\s*\1\s*kg\b/i.test(text) ||
    /\b(\d+)\s*mol\s*=\s*\1\s*g\b/i.test(text) ||
    /\b(\d+)\s*g\s*=\s*\1\s*mol\b/i.test(text)
  ) {
    issues.push(issue("domain", "unit_mismatch", "Birim dönüşümü tutarsız."));
  }
  for (const msg of checkImpossiblePercentClaims(text)) {
    issues.push(issue("domain", "impossible_percent", msg));
  }
  // Subject hint only softens messaging; checks stay deterministic.
  void input.subjectHint;
  return issues;
}

function pedagogyCheck(input: IndependentValidationInput): ValidationIssue[] {
  return (input.pedagogyIssues ?? []).map((message) =>
    issue("pedagogy", "pedagogy_rule", message),
  );
}

const STAGE_RUNNERS: Record<
  "structural" | "source" | "domain" | "pedagogy",
  (input: IndependentValidationInput) => ValidationIssue[]
> = {
  structural: structuralCheck,
  source: sourceCheck,
  domain: domainCheck,
  pedagogy: pedagogyCheck,
};

/**
 * Run independent checks in fixed order. Stops at first failing stage
 * (issues still collected within that stage).
 */
export function runIndependentValidation(
  input: IndependentValidationInput,
): IndependentValidationResult {
  const issues: ValidationIssue[] = [];
  const stagesMs: Partial<Record<ValidationStage, number>> = {};
  let failedStage: ValidationStage | null = null;

  for (const stage of STAGE_ORDER) {
    const started = Date.now();
    const stageIssues = STAGE_RUNNERS[stage](input);
    stagesMs[stage] = Date.now() - started;
    if (stageIssues.length) {
      issues.push(...stageIssues);
      failedStage = stage;
      break;
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    failedStage,
    stagesMs,
  };
}

/** Flatten issues for quality-gate `validate` callbacks. */
export function issueMessages(result: IndependentValidationResult): string[] {
  return result.issues.map((i) => `[${i.stage}] ${i.message}`);
}

export function emptyMetrics(
  partial?: Partial<ValidationMetrics>,
): ValidationMetrics {
  return {
    generationMs: 0,
    validationMs: 0,
    stagesMs: {},
    failedStage: null,
    failureCodes: [],
    repairAttempted: false,
    recheckPassed: null,
    outcome: "rejected",
    ...partial,
  };
}

/**
 * After repair, content must pass independent checks again — never auto-accept.
 */
export function recheckAfterRepair(
  input: IndependentValidationInput,
): IndependentValidationResult {
  return runIndependentValidation(input);
}
