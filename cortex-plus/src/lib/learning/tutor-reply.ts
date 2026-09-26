/**
 * Sınav sohbetinin yanıt biçimi: yapılandırılmış bölümler, hüküm, sadece cevap,
 * rozet, kaynak çipi, takip önerisi. Model metnini öğrenciye gitmeden önce
 * burası düzeltir.
 */

import type { GradedClaim, ClaimVerdict } from "@/lib/learning/tutor-quant";
import {
  checkExpectedMarker,
  stripCheckMarker,
  validateCheckQuestion,
  type CheckExpected,
} from "@/lib/learning/check-question";
import { repairTurkishSurface, fluencyIssues } from "@/lib/learning/learner-fluency";
import {
  matchExcludedTopic,
  topWeightedTopic,
  type CoverageDecision,
  type SyllabusScope,
} from "@/lib/learning/prep-corpus";

export type TutorIntent = "explain" | "solve" | "grade" | "quick" | "scope";

export type TutorStructuredCitation =
  | {
      kind: "doc";
      documentName: string;
      pageNumber: number | null;
      slide?: boolean;
      href: string;
    }
  | {
      kind: "history";
      id: string;
      label: string;
    };

export type TutorStructured = {
  intent: TutorIntent;
  analogy?: string;
  rule?: string;
  example?: string;
  check?: string;
  verdict?: ClaimVerdict;
  warmLine?: string;
  answer?: string;
  steps?: string;
  followUp?: string;
  citations?: TutorStructuredCitation[];
};

export type ReplyCitation = {
  documentName: string;
  pageNumber: number | null;
  slide: boolean;
  href: string;
};

export type ReplyHistoryCitation = {
  id: string;
  label: string;
};

export type ReplyChip = { label: string; prompt: string };

export type ReplyQuote = { text: string; source: string };

export type ReplyVerdictChip = {
  verdict: ClaimVerdict;
  label: string;
};

export type ReplyChrome = {
  body: string;
  badge: string | null;
  steps: string | null;
  citations: ReplyCitation[];
  historyCitations: ReplyHistoryCitation[];
  chips: ReplyChip[];
  scope: ReplyChip | null;
  quote: ReplyQuote | null;
  analogy: string | null;
  rule: string | null;
  example: string | null;
  check: string | null;
  verdict: ReplyVerdictChip | null;
  verifying: boolean;
  followUp: string | null;
};

const ANSWER_ONLY = /sadece\s+cevab|yalnızca\s+cevab|only\s+the\s+answer|just\s+the\s+answer|cevap\s+yeter/i;

const VERDICT_LABEL: Record<ClaimVerdict, string> = {
  dogru: "Tam isabet",
  kismen: "Neredeyse",
  yanlis: "Tekrar bakalım",
};

export function verdictChipLabel(verdict: ClaimVerdict): string {
  return VERDICT_LABEL[verdict];
}

export function requestsAnswerOnly(message: string): boolean {
  return ANSWER_ONLY.test(message);
}

export function turkishDecimals(text: string): string {
  return text.replace(/(?<![\d.,])(\d+)\.(\d+)(?![\d.,])/g, "$1,$2");
}

export function softenTutorHeaders(text: string): string {
  return text.replace(
    /^\s*\*\*(Tanım|İnceleme|Örnek|Kontrol Sorusu|Doğru Düşünce|Yaygın Hata|Nerede Takıldın\??|Tek İpucu)\*\*\s*/gim,
    "",
  );
}

export function stripOutsideLabel(text: string): string {
  return text
    .replace(/^\s*Bu,\s*belgede yok\.?\s*/i, "")
    .replace(/^\s*This is not in the material\.?\s*/i, "")
    .replace(/\[\[rozet:[^\]]+\]\]/g, "")
    .replace(/^#{1,6}\s*Materyal dışı\s*:?\s*/gim, "")
    .replace(/^#{1,6}\s*Outside the material\s*:?\s*/gim, "")
    .replace(/^\s*Materyal dışı\s*:\s*/gim, "")
    .replace(/^\s*Outside the material\s*:\s*/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function shortAnswer(text: string): string | null {
  const mol = text.match(/(\d+(?:[.,]\d+)?)\s*mol\b/i);
  if (mol) return `${mol[1].replace(".", ",")} mol`;
  const bold = text.match(/\*\*([^*]{1,80})\*\*/);
  if (bold && bold[1].length < 60) return bold[1].replace(/^Sadece cevap:\s*/i, "").trim();
  const line = text.split(/\n/).map((item) => item.trim()).find(Boolean);
  if (!line) return null;
  return line.replace(/^[*#\s]+|[*#\s]+$/g, "").slice(0, 80);
}

const DEFAULT_QUICK_FOLLOW = "İstersen aynı tipte bir soru da çözelim mi?";

/** İstenen biçim: kalın cevap, adımlar katlanır, takip sorusu. */
export function shapeAnswerOnly(text: string, followUp?: string): string {
  const cleaned = softenTutorHeaders(stripOutsideLabel(text));
  const answer = shortAnswer(cleaned) ?? "—";
  const steps = cleaned
    .replace(/\*\*Sadece cevap:[^*]*\*\*/i, "")
    .replace(/\[\[takip:[^\]]+\]\]/g, "")
    .trim();
  const body = `**Sadece cevap: ${answer}.**`;
  const follow = followUp?.trim() || DEFAULT_QUICK_FOLLOW;
  const followMarker = `[[takip:${follow.replace(/[\]|]/g, " ")}]]`;
  if (!steps || steps.length < 12 || foldSame(steps, answer)) {
    return `${body}\n\n${followMarker}`;
  }
  return `${body}\n\nİşlemi görmek istersen aşağıyı aç.\n\n[[adimlar]]\n${steps}\n[[/adimlar]]\n\n${followMarker}`;
}

function foldSame(steps: string, answer: string): boolean {
  return steps.replace(/\s+/g, " ").trim() === answer;
}

/** "geçebiliriz mi?" → "geçebilir miyiz?" Kişi eki soru ekinden önce durmasın. */
export function fixTurkishQuestionOrder(text: string): string {
  return text.replace(
    /(\p{L}*?(?:ebilir|abilir|iyor|ıyor|uyor|üyor))(iz|ız|uz|üz)\s+(mi|mı|mu|mü)(?=[\s?.!,]|$)/giu,
    (_all, stem: string, _person: string, particle: string) => {
      const p = particle.toLocaleLowerCase("tr");
      const suffix = p === "mi" ? "yiz" : p === "mı" ? "yız" : p === "mu" ? "yuz" : "yüz";
      return `${stem} ${p}${suffix}`;
    },
  );
}

export function followUpChips(input: {
  answerOnly: boolean;
  graded: boolean;
  scopeTopic: string | null;
  weightedTopic: string | null;
  scopeDetail?: boolean;
  intent?: TutorIntent | null;
}): ReplyChip[] {
  const weighted = input.weightedTopic
    ? { label: "Ağırlıklı konuya geç", prompt: `${input.weightedTopic} konusuna geçelim. Oradan bir örnek çöz.` }
    : { label: "Bir soru daha sor", prompt: "Bana benzer zorlukta bir soru daha sor." };
  if (input.scopeTopic || input.intent === "scope") {
    const back = input.weightedTopic
      ? { label: `Sınav konusuna dön (${input.weightedTopic})`, prompt: `${input.weightedTopic} konusuna dönelim.` }
      : { label: "Sınav konusuna dön", prompt: "Sınav kapsamındaki bir konuya dönelim." };
    if (input.scopeDetail) {
      return [back, { label: "Kısa örnek ver", prompt: "Bu konu için kısa bir örnek yeter." }];
    }
    return [
      { label: "Yine de detaylı anlat", prompt: `${input.scopeTopic ?? "Bu konu"} konusunu yine de ayrıntılı anlat.` },
      back,
    ].slice(0, 3);
  }
  if (input.intent === "explain") {
    return [
      { label: "Bir örnek daha", prompt: "Aynı konuda bir örnek daha göster." },
      { label: "Beni test et", prompt: "Bu konudan beni kısa bir soruyla test et." },
      { label: "Daha basit anlat", prompt: "Aynı konuyu daha basit anlat." },
    ];
  }
  if (input.intent === "grade" || input.graded) {
    return [
      { label: "Benzer bir soru", prompt: "Buna benzer bir soru ver, cevabı bende kalsın." },
      { label: "Adımları tekrar göster", prompt: "Az önceki çözümün adımlarını tekrar göster." },
      weighted,
    ].slice(0, 3);
  }
  if (input.answerOnly || input.intent === "quick") {
    return [
      { label: "Adım adım göster", prompt: "Az önceki hesabı adım adım göster." },
      { label: "Benzer bir soru ver", prompt: "Buna benzer bir soru ver." },
      weighted,
    ].slice(0, 3);
  }
  return [
    { label: "Benzer bir soru ver", prompt: "Buna benzer bir soru ver, cevabı bende kalsın." },
    { label: "Adım adım göster", prompt: "Az önceki örneği adım adım göster." },
    weighted,
  ].slice(0, 3);
}

function chipMarker(chip: ReplyChip): string {
  return `[[chip:${chip.label}|${chip.prompt.replace(/[\]|]/g, " ")}]]`;
}

export function citationMarker(citation: ReplyCitation): string {
  const name = citation.documentName.replace(/[\]|]/g, " ").trim() || "Belge";
  const page = citation.pageNumber != null ? String(citation.pageNumber) : "";
  const kind = citation.slide ? "slayt" : "sayfa";
  const href = citation.href.startsWith("/") ? citation.href : "/dokumanlar";
  return `[[kaynak:${name}|${page}|${kind}|${href}]]`;
}

function historyMarker(item: ReplyHistoryCitation): string {
  return `[[gecmis:${item.id}|${item.label.replace(/[\]|]/g, " ")}]]`;
}

function verdictMarker(verdict: ClaimVerdict): string {
  return `[[hukum:${verdict}|${VERDICT_LABEL[verdict]}]]`;
}

const INTENTS = new Set<TutorIntent>(["explain", "solve", "grade", "quick", "scope"]);

export function parseTutorStructured(raw: string): TutorStructured | null {
  const trimmed = raw.trim();
  const jsonSlice = trimmed.startsWith("{")
    ? trimmed
    : trimmed.match(/\{[\s\S]*\}/)?.[0] ?? "";
  if (!jsonSlice.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(jsonSlice) as Record<string, unknown>;
    const intent = parsed.intent;
    if (typeof intent !== "string" || !INTENTS.has(intent as TutorIntent)) return null;
    const str = (key: string) => {
      const value = parsed[key];
      return typeof value === "string" && value.trim() ? value.trim() : undefined;
    };
    const verdict = parsed.verdict;
    const citations = Array.isArray(parsed.citations)
      ? (parsed.citations as TutorStructuredCitation[]).filter((item) => {
          if (!item || typeof item !== "object") return false;
          if (item.kind === "history") return typeof item.id === "string" && typeof item.label === "string";
          if (item.kind === "doc") return typeof item.documentName === "string";
          return false;
        })
      : undefined;
    return {
      intent: intent as TutorIntent,
      analogy: str("analogy"),
      rule: str("rule"),
      example: str("example"),
      check: str("check"),
      warmLine: str("warmLine"),
      answer: str("answer"),
      steps: str("steps"),
      followUp: str("followUp"),
      verdict:
        verdict === "dogru" || verdict === "kismen" || verdict === "yanlis"
          ? verdict
          : undefined,
      citations,
    };
  } catch {
    return null;
  }
}

function escapeMarker(text: string): string {
  return text.replace(/[\]|]/g, " ").replace(/\n+/g, " ").trim();
}

/**
 * Yapılandırılmış cevabı chrome marker metnine çevirir.
 * Kontrol sorusu kapıdan geçmezse check düşer.
 */
export function serializeStructuredReply(
  structured: TutorStructured,
  options?: { context?: string; expected?: CheckExpected | null },
): { content: string; intent: TutorIntent; expected: CheckExpected | null } {
  const parts: string[] = [];
  let expected: CheckExpected | null = options?.expected ?? null;

  if (structured.verdict) {
    parts.push(verdictMarker(structured.verdict));
  }
  if (structured.warmLine) {
    parts.push(structured.warmLine);
  }

  if (structured.intent === "quick" || structured.answer) {
    const answer = structured.answer ?? "—";
    const shaped = shapeAnswerOnly(
      structured.steps
        ? `**Sadece cevap: ${answer}.**\n\n${structured.steps}`
        : `**Sadece cevap: ${answer}.**`,
      structured.followUp,
    );
    parts.push(shaped);
  } else {
    if (structured.analogy) {
      parts.push(`[[benzetme:${escapeMarker(structured.analogy)}]]`);
    }
    if (structured.rule) {
      parts.push(`[[kural:${structured.rule.replace(/\]\]/g, "] ]")}]]`);
    }
    if (structured.example) {
      parts.push(`[[ornek:${structured.example.replace(/\]\]/g, "] ]")}]]`);
    }
    if (structured.check) {
      const validated = validateCheckQuestion(structured.check, options?.context ?? "");
      if (validated.ok) {
        parts.push(`[[sira-sende:${validated.question.replace(/\]\]/g, "] ]")}]]`);
        expected = validated.expected;
        const marker = checkExpectedMarker(validated.expected);
        if (marker) parts.push(marker);
      }
    }
    if (structured.followUp) {
      parts.push(`[[takip:${escapeMarker(structured.followUp)}]]`);
    }
  }

  for (const cite of structured.citations ?? []) {
    if (cite.kind === "history") {
      parts.push(historyMarker({ id: cite.id, label: cite.label }));
    } else {
      parts.push(
        citationMarker({
          documentName: cite.documentName,
          pageNumber: cite.pageNumber,
          slide: Boolean(cite.slide),
          href: cite.href || "/dokumanlar",
        }),
      );
    }
  }

  return { content: parts.join("\n\n").trim(), intent: structured.intent, expected };
}

export function structuredTutorJsonInstruction(): string {
  return [
    "Yanıtını YALNIZCA tek bir JSON nesnesi olarak ver. Serbest düz metin yazma.",
    'Şema: {"intent":"explain|solve|grade|quick|scope","analogy?":"...","rule?":"LaTeX $...$","example?":"...","check?":"...","verdict?":"dogru|kismen|yanlis","warmLine?":"...","answer?":"...","steps?":"...","followUp?":"...","citations?":[{"kind":"doc","documentName":"...","pageNumber":1,"href":"/..."}|{"kind":"history","id":"...","label":"..."}]}',
    "intent=explain: analogy → rule (KaTeX) → example (kaynaklı) → check (tek soru). Benzetme kavramsal doğru olsun.",
    "intent=grade: warmLine sıcak ve net olsun. Etiket yığını yazma (Hüküm:, Doğru parça: yok). Yanlışta: öv → hatayı adlandır → doğru çözüm → mini check.",
    "intent=quick: answer zorunlu; steps kısa; followUp tek satır.",
    "intent=scope: kapsam dışı olduğunu söyle; uzun ders anlatma.",
    "Kontrol sorusu tek cevaplıysa veriler eksiksiz olsun; oranlar eşitse soruyu değiştir.",
    "Geçmişe yalnızca bağlamda verilen gerçek kayıtlara değin; uydurma.",
    "Formülleri $...$ veya $$...$$ ile yaz; kimya için \\ce{H2O} kullan.",
  ].join("\n");
}

export function examTutorAddendum(input: {
  message: string;
  grade: GradedClaim | null;
  decision: CoverageDecision;
  scope: SyllabusScope;
  excerpts: string;
  personalization?: string;
}): string {
  const answerOnly = requestsAnswerOnly(input.message);
  const excluded = matchExcludedTopic(input.message, input.scope);
  const weighted = topWeightedTopic(input.scope);
  const lines = [
    "SINAV SOHBETİ — yapılandırılmış JSON (yukarıdaki şema):",
    "Yeni kavramda sıra: günlük benzetme, tek yöntem kuralı (KaTeX), belgeden örnek, sonra öğrenciye tek kontrol sorusu.",
    "Örneği uydurma; aşağıdaki alıntıdan seç. Kaynağı dosya adı ve sayfa ile an.",
    "Öğrenci iddia edince hüküm iç hesaptan gelir. warmLine sıcak yaz: Tam isabet / Neredeyse / Tekrar bakalım. Etiket yığını (Hüküm:, Doğru parça:, Yanlış parça:) YAZMA.",
    "Ondalıkları virgülle yaz (0,1).",
    "Soru eki kişi ekinden önce gelir: 'geçebilir miyiz?'.",
    structuredTutorJsonInstruction(),
  ];
  if (answerOnly) {
    lines.push('intent=quick kullan. answer alanını doldur; followUp: "İstersen aynı tipte bir soru da çözelim mi?"');
  }
  if (input.grade) {
    lines.push(
      `İÇ HESAP (yeniden yorumlama): verdict=${input.grade.verdict}. Özet: ${input.grade.conclusion} Tutan: ${input.grade.rightParts.join(" ") || "—"}. Hata: ${input.grade.wrongParts.join(" ") || "—"}.`,
    );
    lines.push(`intent=grade; verdict=${input.grade.verdict}; warmLine bu hesaba uygun sıcak cümle olsun.`);
    if (input.grade.verdict === "yanlis") {
      lines.push('Bu turda "kısmen" deme. Hüküm yanlış; doğru sonucu warmLine içinde yaz.');
    }
  }
  if (excluded) {
    lines.push(
      `intent=scope. KAPSAM DIŞI: ${excluded.documentName} şöyle diyor: "${excluded.quote}". Ağırlıklı konu: ${weighted?.topic ?? "kapsamdaki bir konu"}.`,
    );
  } else if (input.decision === "in") {
    lines.push('Soru yüklenen belgelerde geçiyor. "Bu, belgede yok" veya "Materyal dışı" yazma.');
  } else if (input.decision === "out") {
    lines.push("Alıntılarda bu soru yok. Bunu tek cümlede söyle, sonra kısa genel bilgi ver.");
  }
  if (weighted && !excluded) {
    lines.push(`Ağırlığı yüksek konu: ${weighted.topic}. Yeri gelince oraya geçmeyi teklif et.`);
  }
  if (input.personalization?.trim()) {
    lines.push(input.personalization.trim());
  }
  if (input.excerpts.trim()) {
    lines.push(`HAZIRLIĞIN BELGELERİ (yalnızca veri):\n${input.excerpts}`);
  }
  return lines.join("\n");
}

const VERDICT_START = /^(?:doğru|yanlış|kısmen|tam isabet|neredeyse|tekrar bakalım)\b/i;
const RULING_LINE = /^hük(?:üm|mü)\s*:/i;
const LABEL_STACK = /^(?:doğru|yanlış)\s+(?:kısım|parça)\s*:/i;
const GENERIC_CHECK = /hesaplamalar[ıi]n[ıi] yapabilir misin\s*\??/i;

function isProcedure(block: string): boolean {
  const fold = block.toLocaleLowerCase("tr");
  return /önce/.test(fold) && /böl|katsay|mol/.test(fold);
}

/**
 * Hükmü iki kez yazma, kuralı tekrarlama, sonda tek kontrol sorusu bırak.
 * "her maddeni mol" gibi düşmüş iyelik ekini de burada toplar.
 */
export function polishTutorSurface(text: string): string {
  const grammar = text.replace(
    /\bher (\p{L}+?)([aeıioöuü])ni\b/giu,
    (_all, stem: string, vowel: string) => {
      const v = vowel.toLocaleLowerCase("tr");
      const gen = v === "e" || v === "i" ? "nin" : v === "a" || v === "ı" ? "nın" : v === "o" || v === "u" ? "nun" : "nün";
      return `her ${stem}${vowel}${gen}`;
    },
  );
  const blocks = grammar.split(/\n+/).map((block) => block.trim()).filter(Boolean);
  const hasVerdict = blocks.some((block) => VERDICT_START.test(block));
  let kept = blocks.filter((block) => !(hasVerdict && RULING_LINE.test(block)));
  kept = kept.filter((block) => !LABEL_STACK.test(block));
  const questions = kept.filter((block) => block.includes("?"));
  if (questions.length > 1) {
    kept = kept.filter((block) => !(GENERIC_CHECK.test(block) && questions.some((other) => other !== block)));
  }
  let seenProcedure = false;
  kept = kept.filter((block) => {
    if (!isProcedure(block)) return true;
    if (seenProcedure && /^önce\b/i.test(block.trim())) return false;
    seenProcedure = true;
    return true;
  });
  return kept.join("\n\n").trim();
}

/** Fluency kapısı: bozuk cümleleri çıkarır, yüzeyi onarır. Chrome marker'lara dokunmaz. */
export function applyChatFluencyGate(text: string): string {
  const lines = text.split("\n");
  const repairedLines = lines.map((line) => {
    if (/^\[\[/.test(line.trim())) return line;
    return repairTurkishSurface(line);
  });
  const repaired = repairedLines.join("\n");
  const issues = fluencyIssues(repaired.replace(/\[\[[^\]]+\]\]/g, " "));
  if (!issues.length) return repaired;
  const sentences = repaired.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((sentence) => {
    if (/\[\[/.test(sentence)) return true;
    const local = fluencyIssues(sentence);
    return local.every((issue) => issue === "typo");
  });
  return (kept.length ? kept.join(" ") : repaired).trim();
}

function warmLineFromGrade(grade: GradedClaim): string {
  if (grade.verdict === "dogru") {
    const why = grade.rightParts[0] || grade.conclusion;
    return `Tam isabet! ${why}`.trim();
  }
  if (grade.verdict === "kismen") {
    const right = grade.rightParts[0] ? `${grade.rightParts[0]} ` : "";
    const wrong = grade.wrongParts[0] || "Gerekçede bir adım eksik kaldı.";
    return `Neredeyse! ${right}${wrong} Doğrusu: ${grade.conclusion}`.trim();
  }
  const named = grade.wrongParts[0]
    ? `İşte en sık yapılan hata bu: ${grade.wrongParts[0]}`
    : grade.rightParts[0]
      ? grade.rightParts[0]
      : "Bu adımda sapma var.";
  return `Tekrar bakalım. ${named} Doğrusu: ${grade.conclusion}`.trim();
}

function ensureGrade(text: string, grade: GradedClaim): string {
  let next = text.trim();
  // Eski etiket yığınını temizle.
  next = next
    .replace(/^\s*(?:\*\*)?Hüküm\s*:[^\n]*\n*/gim, "")
    .replace(/^\s*(?:\*\*)?Doğru\s+(?:kısım|parça)\s*:[^\n]*\n*/gim, "")
    .replace(/^\s*(?:\*\*)?Yanlış\s+(?:kısım|parça)\s*:[^\n]*\n*/gim, "")
    .replace(/^\s*(?:\*\*)?Sonuç\s*:\s*/gim, "");
  if (grade.verdict !== "kismen") {
    next = next.replace(/^\s*(?:\*\*)?(?:Bu\s+)?kısmen doğru[^.]*\.\s*/i, "");
  }
  const fold = next.toLocaleLowerCase("tr");
  const hasWarm =
    fold.startsWith("tam isabet") ||
    fold.startsWith("neredeyse") ||
    fold.startsWith("tekrar bakalım") ||
    fold.includes("tam isabet!") ||
    fold.includes("neredeyse!");
  // Yalnızca eski kısa hüküm önekini düşür; "Doğru sonucu…" gibi gövdeyi yeme.
  next = next
    .replace(/^\s*(?:\*\*)?(?:Doğru|Yanlış|Kısmen doğru)\.\s+/i, "")
    .replace(/^\s*(?:\*\*)?(?:Doğru|Yanlış|Kısmen doğru):\s*[^\n]+(?:\n+|$)/i, "");
  if (!hasWarm) {
    const warm = warmLineFromGrade(grade);
    next = `${verdictMarker(grade.verdict)}\n\n${warm}\n\n${next}`.trim();
  } else if (!/\[\[hukum:/.test(next)) {
    next = `${verdictMarker(grade.verdict)}\n\n${next}`.trim();
  }
  return next;
}

function scopeQuoteMarker(quote: string, documentName: string): string {
  const text = quote.replace(/[\]|]/g, " ").replace(/\s+/g, " ").trim();
  const source = documentName.replace(/[\]|]/g, " ").trim() || "Belge";
  return `[[alinti:${text}|${source}]]`;
}

function wantsScopeDetail(message: string): boolean {
  return /yine de|detaylı anlat|ayrıntılı anlat|tam anlat/i.test(message);
}

function briefScopeSummary(text: string, quote: string): string {
  const cleaned = stripOutsideLabel(text)
    .replace(/\[\[alinti:[^\]]+\]\]/g, "")
    .replace(/^>.*$/gm, "")
    .replace(/^\s*Bu konu sınav kapsamı dışındadır\.?\s*/i, "")
    .replace(/\*\*[^*]{1,80}\*\*/g, "");
  const sentences = cleaned
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.replace(/^[-*•]\s*/, "").trim())
    .filter((sentence) => sentence.length >= 25)
    .filter((sentence) => !/sınav kapsamı dışındadır/i.test(sentence))
    .filter((sentence) => !quote || !sentence.includes(quote.slice(0, 24)));
  return sentences.slice(0, 2).join(" ");
}

function ensureScope(text: string, quote: string, documentName: string, weighted: string | null, detailed: boolean): string {
  const marker = scopeQuoteMarker(quote, documentName);
  if (detailed) {
    let next = stripOutsideLabel(text).replace(/^>.*$/gm, "").trim();
    if (!next.includes("[[alinti:") && !next.includes(quote.slice(0, 24))) {
      next = `${marker}\n\n${next}`.trim();
    }
    if (!/kapsam dışı/.test(next.toLocaleLowerCase("tr"))) {
      next = `Bu konu sınav kapsamı dışındadır.\n\n${next}`.trim();
    }
    return next;
  }
  const summary = briefScopeSummary(text, quote);
  const parts = ["Bu konu sınav kapsamı dışındadır.", marker];
  if (summary) parts.push(summary);
  if (weighted) parts.push(`Sınavda ağırlığı yüksek olan konu: **${weighted}**.`);
  return parts.join("\n\n");
}

function extractAndValidateCheck(text: string, context: string): { text: string; expected: CheckExpected | null } {
  let expected: CheckExpected | null = null;
  let next = text;
  next = next.replace(/\[\[sira-sende:([\s\S]*?)\]\]/g, (_all, question: string) => {
    const validated = validateCheckQuestion(question.trim(), context);
    if (!validated.ok) return "";
    expected = validated.expected;
    return `[[sira-sende:${validated.question.replace(/\]\]/g, "] ]")}]]`;
  });
  // Serbest metindeki son soru işareti satırını da denetle (structured değilse).
  if (!/\[\[sira-sende:/.test(next)) {
    const lines = next.split(/\n+/);
    const lastQ = [...lines].reverse().find((line) => /\?\s*$/.test(line.trim()) && line.trim().length > 12);
    if (lastQ) {
      const validated = validateCheckQuestion(lastQ.trim(), context);
      if (!validated.ok) {
        next = lines.filter((line) => line.trim() !== lastQ.trim()).join("\n\n");
      } else if (validated.question !== lastQ.trim()) {
        next = next.replace(lastQ, validated.question);
        expected = validated.expected;
        next += `\n\n[[sira-sende:${validated.question.replace(/\]\]/g, "] ]")}]]`;
        // Orijinal serbest soru satırını kaldır (kartta gösterilecek).
        next = next
          .split(/\n+/)
          .filter((line) => line.trim() !== validated.question.trim() || /\[\[sira-sende:/.test(line))
          .join("\n\n");
      } else {
        expected = validated.expected;
      }
    }
  }
  const marker = checkExpectedMarker(expected);
  if (marker && !/\[\[cek:/.test(next)) next = `${next}\n\n${marker}`;
  return { text: next, expected };
}

export function finalizeTutorReply(input: {
  message: string;
  draft: string;
  decision: CoverageDecision;
  scope: SyllabusScope;
  grade: GradedClaim | null;
  language?: "tr" | "en";
  intent?: TutorIntent | null;
  context?: string;
}): { content: string; misconception: GradedClaim | null; intent: TutorIntent | null } {
  const excluded = matchExcludedTopic(input.message, input.scope);
  const weighted = topWeightedTopic(input.scope);
  const scopeDetail = wantsScopeDetail(input.message);
  let intent: TutorIntent | null = input.intent ?? null;
  let text = softenTutorHeaders(input.draft);

  const structured = parseTutorStructured(text);
  if (structured) {
    const serialized = serializeStructuredReply(structured, { context: input.context ?? "" });
    text = serialized.content;
    intent = serialized.intent;
  }

  if (excluded) {
    text = ensureScope(text, excluded.quote, excluded.documentName, weighted?.topic ?? null, scopeDetail);
    intent = intent ?? "scope";
  } else if (input.decision === "in") {
    text = stripOutsideLabel(text);
  }
  if (input.grade) {
    text = ensureGrade(text, input.grade);
    intent = intent ?? "grade";
  }
  if (requestsAnswerOnly(input.message)) {
    text = shapeAnswerOnly(text);
    intent = "quick";
  }

  const checked = extractAndValidateCheck(text, input.context ?? "");
  text = checked.text;

  if ((input.language ?? "tr") === "tr") {
    text = applyChatFluencyGate(polishTutorSurface(fixTurkishQuestionOrder(turkishDecimals(text))));
  }

  const chips = followUpChips({
    answerOnly: requestsAnswerOnly(input.message) || intent === "quick",
    graded: Boolean(input.grade) || intent === "grade",
    scopeTopic: excluded?.topic ?? null,
    weightedTopic: weighted?.topic ?? null,
    scopeDetail,
    intent,
  });
  const tail = chips.map(chipMarker);
  const content = `${text.trim()}\n\n${tail.join("\n")}`.trim();
  const misconception = input.grade && input.grade.verdict !== "dogru" ? input.grade : null;
  return { content, misconception, intent };
}

export function chatMisconceptionRow(grade: GradedClaim, questionPreview: string) {
  return {
    topic_label: grade.topicLabel,
    claim: grade.wrongParts[0]?.slice(0, 240) || grade.verdictLine.slice(0, 240),
    corrected: grade.conclusion.slice(0, 280),
    wrong_type: (grade.wrongType || "chat_claim").slice(0, 80),
    source_kind: "chat",
    question_preview: questionPreview.slice(0, 180),
  };
}

/** Kopyala / TTS için chrome işaretlerini düz metne indirger. */
export function plainTutorText(content: string): string {
  let body = stripCheckMarker(content);
  body = body.replace(/\[\[rozet:([^\]]+)\]\]/g, "$1");
  body = body.replace(/\[\[benzetme:([^\]]+)\]\]/g, "Benzetme: $1");
  body = body.replace(/\[\[kural:([\s\S]*?)\]\]/g, "$1");
  body = body.replace(/\[\[ornek:([\s\S]*?)\]\]/g, "Notlarından bir örnek: $1");
  body = body.replace(/\[\[sira-sende:([\s\S]*?)\]\]/g, "$1");
  body = body.replace(/\[\[hukum:[^|\]]+\|([^\]]+)\]\]/g, "$1");
  body = body.replace(/\[\[takip:([^\]]+)\]\]/g, "$1");
  body = body.replace(/\[\[gecmis:[^|\]]+\|([^\]]+)\]\]/g, "$1");
  body = body.replace(/\[\[kaynak:([^|\]]+)\|([^|]*)\|(sayfa|slayt)\|(\/[^\]\s]+)\]\]/g, (_a, name: string, page: string, kind: string) => {
    const pageBit = page.trim() ? ` · ${kind === "slayt" ? "slayt" : "s."} ${page.trim()}` : "";
    return `${name.trim()}${pageBit}`;
  });
  body = body.replace(/\[\[chip:[^\]]+\]\]/g, "");
  body = body.replace(/\[\[kapsam:[^\]]+\]\]/g, "");
  body = body.replace(/\[\[alinti:([^|\]]+)\|([^\]]+)\]\]/g, "\"$1\" — $2");
  body = body.replace(/\[\[dogrulaniyor\]\]/g, "");
  body = body.replace(/\[\[adimlar\]\]([\s\S]*?)\[\[\/adimlar\]\]/g, "$1");
  body = body.replace(/\$\$([\s\S]+?)\$\$/g, "$1");
  body = body.replace(/\$([^$\n]+)\$/g, "$1");
  body = body.replace(/\\ce\{([^}]+)\}/g, "$1");
  body = body.replace(/\*\*([^*]+)\*\*/g, "$1");
  return body.replace(/\n{3,}/g, "\n\n").trim();
}

export function splitTutorChrome(content: string): ReplyChrome {
  let body = content;
  const citations: ReplyCitation[] = [];
  const historyCitations: ReplyHistoryCitation[] = [];
  const chips: ReplyChip[] = [];
  let badge: string | null = null;
  let steps: string | null = null;
  let scope: ReplyChip | null = null;
  let quote: ReplyQuote | null = null;
  let analogy: string | null = null;
  let rule: string | null = null;
  let example: string | null = null;
  let check: string | null = null;
  let verdict: ReplyVerdictChip | null = null;
  let followUp: string | null = null;
  let verifying = false;

  body = stripCheckMarker(body);
  body = body.replace(/\[\[dogrulaniyor\]\]/g, () => {
    verifying = true;
    return "";
  });
  body = body.replace(/\[\[rozet:([^\]]+)\]\]/g, (_all, label: string) => {
    badge = label.trim();
    return "";
  });
  body = body.replace(/\[\[hukum:(dogru|kismen|yanlis)\|([^\]]+)\]\]/g, (_all, v: string, label: string) => {
    verdict = { verdict: v as ClaimVerdict, label: label.trim() };
    return "";
  });
  body = body.replace(/\[\[benzetme:([^\]]+)\]\]/g, (_all, text: string) => {
    analogy = text.trim();
    return "";
  });
  body = body.replace(/\[\[kural:([\s\S]*?)\]\]/g, (_all, text: string) => {
    rule = text.trim();
    return "";
  });
  body = body.replace(/\[\[ornek:([\s\S]*?)\]\]/g, (_all, text: string) => {
    example = text.trim();
    return "";
  });
  body = body.replace(/\[\[sira-sende:([\s\S]*?)\]\]/g, (_all, text: string) => {
    check = text.trim();
    return "";
  });
  body = body.replace(/\[\[takip:([^\]]+)\]\]/g, (_all, text: string) => {
    followUp = text.trim();
    return "";
  });
  body = body.replace(/\[\[gecmis:([^|\]]+)\|([^\]]+)\]\]/g, (_all, id: string, label: string) => {
    historyCitations.push({ id: id.trim(), label: label.trim() });
    return "";
  });
  body = body.replace(/\[\[kaynak:([^|\]]+)\|([^|]*)\|(sayfa|slayt)\|(\/[^\]\s]+)\]\]/g, (_all, name: string, page: string, kind: string, href: string) => {
    const pageNumber = page.trim() ? Number(page) : null;
    citations.push({
      documentName: name.trim(),
      pageNumber: pageNumber != null && Number.isFinite(pageNumber) ? pageNumber : null,
      slide: kind === "slayt",
      href,
    });
    return "";
  });
  body = body.replace(/\[\[chip:([^|\]]+)\|([^\]]+)\]\]/g, (_all, label: string, prompt: string) => {
    chips.push({ label: label.trim(), prompt: prompt.trim() });
    return "";
  });
  body = body.replace(/\[\[kapsam:([^|\]]+)\|([^\]]+)\]\]/g, (_all, topic: string, label: string) => {
    scope = { label: label.trim(), prompt: `${topic.trim()} konusuna geçelim.` };
    return "";
  });
  body = body.replace(/\[\[alinti:([^|\]]+)\|([^\]]+)\]\]/g, (_all, text: string, source: string) => {
    quote = { text: text.trim(), source: source.trim() };
    return "\n\n[[QUOTE]]\n\n";
  });
  const stepsMatch = body.match(/\[\[adimlar\]\]([\s\S]*?)\[\[\/adimlar\]\]/);
  if (stepsMatch) {
    steps = stepsMatch[1].trim();
    body = body.replace(stepsMatch[0], "");
  }
  body = body.replace(/\n{3,}/g, "\n\n").trim();
  return {
    body,
    badge,
    steps,
    citations,
    historyCitations,
    chips,
    scope,
    quote,
    analogy,
    rule,
    example,
    check,
    verdict,
    verifying,
    followUp,
  };
}
