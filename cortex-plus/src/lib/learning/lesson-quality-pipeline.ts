/**
 * Prompt 2 kalite hattı — tek sırayla, paralel kapı yok.
 *
 * 1. repairTurkishSurface
 * 2. Kesin hüküm
 * 3. Önce veri
 * 4. Çözümlü örnek
 * 5. Sayısal denetim
 * 6. Kontrol soruları (yankı + optionWhy)
 * 7. Özet kopya
 * 8. runIndependentValidation
 * 9. Yayın kararı
 *
 * Her adım issues[] döner; sunucu log'una yazılır.
 */

import { absoluteClaimIssues } from "@/lib/learning/absolute-claims";
import { repairTurkishSurface } from "@/lib/learning/learner-fluency";
import {
  isContextlessFragment,
  isCopiedFromPrior,
  isEchoOfPriorText,
} from "@/lib/learning/learner-fluency";
import {
  isHighOverlap,
  optionWhyUniqueIssues,
  type QualityReportEntry,
} from "@/lib/learning/lesson-play";
import { auditQuantitative } from "@/lib/learning/quantitative-audit";
import {
  lessonPublishIssues,
  publishLessonDraft,
  type LessonV2,
} from "@/lib/learning/teaching-standards";
import {
  runIndependentValidation,
  type ValidationIssue,
} from "@/lib/learning/validation-pipeline";
import { workedExampleIssues } from "@/lib/learning/worked-example";

export type QualityStage =
  | "repair_turkish"
  | "absolute_claims"
  | "data_first"
  | "worked_example"
  | "quantitative"
  | "checks"
  | "summary"
  | "independent"
  | "publish";

export type QualityIssue = {
  stage: QualityStage;
  rule: string;
  message: string;
  excerpt?: string;
};

export type LessonQualityResult = {
  lesson: LessonV2 | null;
  issues: QualityIssue[];
  report: QualityReportEntry[];
  accepted: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function repairStringsDeep(value: unknown): unknown {
  if (typeof value === "string") return repairTurkishSurface(value);
  if (Array.isArray(value)) return value.map(repairStringsDeep);
  const row = asRecord(value);
  if (!row) return value;
  return Object.fromEntries(
    Object.entries(row).map(([key, child]) => [key, repairStringsDeep(child)]),
  );
}

function lessonTextBlob(lesson: LessonV2): string {
  return [
    lesson.overview ?? "",
    ...lesson.sections.map((section) => section.body),
    lesson.example?.prompt ?? "",
    lesson.example?.solution ?? "",
  ].join("\n");
}

function countScreens(lesson: LessonV2): number {
  let n = 0;
  if (lesson.overview?.trim()) n += 1;
  n += lesson.sections.length;
  if (lesson.example?.prompt) n += 1;
  if (lesson.commonMistake?.claim) n += 1;
  if (lesson.summary?.length) n += 1;
  if (lesson.findError?.prompt) n += 1;
  if (lesson.numericalCheck?.prompt) n += 1;
  return n;
}

function countChecks(lesson: LessonV2): number {
  return (
    lesson.sections.filter((section) => section.check).length +
    (lesson.infoCheck?.prompt && lesson.infoCheck.answer ? 1 : 0) +
    (lesson.findError?.prompt ? 1 : 0) +
    (lesson.numericalCheck?.prompt ? 1 : 0)
  );
}

function checkIssues(lesson: LessonV2): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const priorBodies = lesson.sections.map((section) => section.body);
  for (let i = 0; i < lesson.sections.length; i += 1) {
    const section = lesson.sections[i];
    const check = section.check;
    if (!check) continue;
    const recent = [
      lesson.overview ?? "",
      ...priorBodies.slice(Math.max(0, i - 2), i + 1),
    ];
    if (isEchoOfPriorText(check.prompt, recent)) {
      issues.push({
        stage: "checks",
        rule: "echo_ban",
        message: `Yankı sorusu: ${section.heading}`,
        excerpt: check.prompt.slice(0, 80),
      });
    }
    for (const prior of recent) {
      if (isHighOverlap(check.prompt, prior, 0.7)) {
        issues.push({
          stage: "checks",
          rule: "echo_ban",
          message: `Yankı örtüşmesi: ${section.heading}`,
          excerpt: check.prompt.slice(0, 80),
        });
        break;
      }
    }
    for (const message of optionWhyUniqueIssues(check)) {
      issues.push({
        stage: "checks",
        rule: "option_why_unique",
        message,
        excerpt: (check.optionWhy ?? []).join(" · ").slice(0, 80),
      });
    }
  }
  return issues;
}

function summaryIssues(lesson: LessonV2): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const summary = lesson.summary ?? [];
  if (summary.length && (summary.length < 3 || summary.length > 5)) {
    issues.push({
      stage: "summary",
      rule: "summary_count",
      message: "Özet 3 ile 5 madde arasında olmalı.",
    });
  }
  const prior = [lesson.overview ?? "", ...lesson.sections.map((section) => section.body)];
  for (const point of summary) {
    if (isContextlessFragment(point)) {
      issues.push({
        stage: "summary",
        rule: "summary_fragment",
        message: "Özet maddesi tek başına anlaşılmıyor.",
        excerpt: point.slice(0, 80),
      });
    }
    if (/^(diğer|ayrıca|bunun yanında)\b/i.test(point.trim())) {
      issues.push({
        stage: "summary",
        rule: "summary_opener",
        message: "Özet Diğer/Ayrıca ile başlayamaz.",
        excerpt: point.slice(0, 80),
      });
    }
    if (isCopiedFromPrior(point, prior) || prior.some((text) => isHighOverlap(point, text, 0.6))) {
      issues.push({
        stage: "summary",
        rule: "summary_copy",
        message: "Özet ders cümlesinin kopyası.",
        excerpt: point.slice(0, 80),
      });
    }
    if (point.trim().split(/\s+/).length > 20) {
      issues.push({
        stage: "summary",
        rule: "summary_length",
        message: "Özet maddesi en fazla 20 kelime olmalı.",
        excerpt: point.slice(0, 80),
      });
    }
  }
  return issues;
}

function toReport(issues: QualityIssue[]): QualityReportEntry[] {
  return issues.map((issue) => ({
    rule: `${issue.stage}:${issue.rule}`,
    excerpt: (issue.excerpt ?? issue.message).slice(0, 80),
  }));
}

/**
 * Bağımsız kalite hattı. Yayım kararı: en az 4 ekran + en az 1 kontrol.
 */
export function runLessonQualityPipeline(
  raw: unknown,
  options: { sourceExcerpt?: string; minSections?: number; keyTerms?: string[] } = {},
): LessonQualityResult {
  const issues: QualityIssue[] = [];
  const repaired = repairStringsDeep(raw);
  issues.push({
    stage: "repair_turkish",
    rule: "surface",
    message: "Türkçe yüzey onarımı uygulandı.",
  });

  const published = publishLessonDraft(repaired, { keyTerms: options.keyTerms });
  if (!published) {
    const publish = lessonPublishIssues(repaired, options);
    for (const message of publish) {
      issues.push({ stage: "publish", rule: "schema", message, excerpt: message.slice(0, 80) });
    }
    return { lesson: null, issues, report: toReport(issues), accepted: false };
  }

  const source = options.sourceExcerpt ?? "";
  if (source.trim()) {
    for (const message of absoluteClaimIssues(published, source)) {
      issues.push({
        stage: "absolute_claims",
        rule: "unsupported_absolute",
        message,
        excerpt: message.slice(0, 80),
      });
    }
  }

  const quantInput = {
    text: lessonTextBlob(published),
    example: published.example
      ? {
          prompt: published.example.prompt,
          solution: published.example.solution,
          givens: published.example.givens,
          unknown: published.example.unknown,
          steps: published.example.steps,
          result: published.example.result,
        }
      : null,
    sections: published.sections.map((section) => section.body),
  };
  const quantitative = auditQuantitative(quantInput);
  for (const message of quantitative) {
    const stage: QualityStage =
      /önce|veri|başlangıç|Hesaptan önce/i.test(message) ? "data_first" :
      /örnek|soyağacı|büyüklük|dangling|unknown/i.test(message) ? "worked_example" :
      "quantitative";
    issues.push({
      stage,
      rule: "quantitative",
      message,
      excerpt: message.slice(0, 80),
    });
  }

  if (published.example) {
    const needsNumbers = /\d/.test(`${published.example.prompt}\n${published.example.solution}`);
    for (const message of workedExampleIssues(
      published.example.prompt,
      published.example.solution,
      source,
      needsNumbers,
    )) {
      issues.push({
        stage: "worked_example",
        rule: "worked_example",
        message,
        excerpt: message.slice(0, 80),
      });
    }
  }

  issues.push(...checkIssues(published));
  issues.push(...summaryIssues(published));

  const independent = runIndependentValidation({
    draft: JSON.stringify(published),
    parsed: published,
    pedagogyIssues: lessonPublishIssues(published, options),
    sourceExcerpt: source || undefined,
    requireSourceSupport: Boolean(source.trim()),
  });
  for (const item of independent.issues) {
    issues.push({
      stage: "independent",
      rule: item.code,
      message: item.message,
      excerpt: item.message.slice(0, 80),
    });
  }

  const screens = countScreens(published);
  const checks = countChecks(published);
  if (screens < 4) {
    issues.push({
      stage: "publish",
      rule: "min_screens",
      message: `En az 4 ekran gerekli; ${screens} bulundu.`,
      excerpt: `ekran=${screens}`,
    });
  }
  if (checks < 1) {
    issues.push({
      stage: "publish",
      rule: "min_checks",
      message: "En az 1 kontrol sorusu kalmalı.",
    });
  }

  const blocking = issues.filter((issue) =>
    issue.stage === "publish" ||
    issue.rule === "unsupported_absolute" ||
    issue.rule === "echo_ban" ||
    issue.rule === "option_why_unique" ||
    issue.rule === "summary_copy" ||
    issue.rule === "summary_opener" ||
    issue.rule === "min_screens" ||
    issue.rule === "min_checks" ||
    (issue.stage === "worked_example" && !/geçer/i.test(issue.message)) ||
    (issue.stage === "independent" && independent.failedStage != null),
  );

  // Yayın: min ekran/kontrol + şema. Diğerleri raporlanır; salvage yolu
  // finishTaughtLesson / settleRejectedLesson ile parçaları düşürür.
  const hardPublish = issues.filter(
    (issue) =>
      issue.rule === "schema" ||
      issue.rule === "min_checks" ||
      (issue.rule === "min_screens" && screens < 2),
  );
  const accepted = hardPublish.length === 0 && checks >= 1;

  if (issues.length) {
    console.error("lesson_quality_pipeline", {
      stages: [...new Set(issues.map((issue) => issue.stage))],
      count: issues.length,
      blocking: blocking.length,
      accepted,
    });
  }

  return {
    lesson: published,
    issues,
    report: toReport(issues.filter((issue) => issue.stage !== "repair_turkish")),
    accepted,
  };
}

export function qualityIssueMessages(result: LessonQualityResult): string[] {
  return result.issues.map((issue) => `[${issue.stage}] ${issue.message}`);
}

export function validationIssuesAsQuality(items: ValidationIssue[]): QualityIssue[] {
  return items.map((item) => ({
    stage: "independent" as const,
    rule: item.code,
    message: item.message,
    excerpt: item.message.slice(0, 80),
  }));
}
