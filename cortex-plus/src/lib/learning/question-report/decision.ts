import { answerKey, sameOptionSet } from "@/lib/learning/exam-quiz";
import { reportReasonLabel, type ReportReason } from "@/lib/learning/question-report/copy";

/**
 * Bildirilen sorunun denetimi (31 Ekim 2026, Paket J2 #10): istem ve modelin kararını okuyan saf işlevler.
 * Model soruyu kendisi çözer; yalnız KESİN hatayı kabul eder. Kod metin yazmaz: düzeltilen anahtar ancak sorunun
 * kendi şıklarından birebir seçilmişse alınır, yoksa soru düzeltilmez, geçersiz sayılır.
 */

export type ReportedQuestion = {
  /** "choice": çoktan seçmeli (tek ya da çok cevaplı), "open": açık uçlu (yazılı deneme). */
  type: "choice" | "open";
  text: string;
  options: string[];
  correct: string[];
  multi: boolean;
  explanation?: string | null;
  steps?: string[] | null;
  /** Açık uçlu soruda örnek cevap ve ölçütler. */
  modelAnswer?: string | null;
  rubric?: string[] | null;
};

export type ReportIssueKind = "key" | "ambiguous" | "broken" | "typo" | "none";

export type ReportDecision = {
  valid: boolean;
  kind: ReportIssueKind;
  /** "fix": anahtar düzeltildi (ve soru tam puan), "void": soru geçersiz (tam puan), "none": hata yok. */
  action: "fix" | "void" | "none";
  correctedKey: string[] | null;
  explanation: string;
};

export const REPORT_CHECK_SYSTEM =
  "Sen bir sınav sorusu denetçisisin. Bir öğrenci bu soruda hata olduğunu bildirdi. Önce soruyu anahtara bakmadan " +
  "KENDİN çöz, sonra kararını ver. Yalnız KESİN bir hata varsa kabul et:\n" +
  "- key: işaretli doğru cevap yanlış, şıklardan başka biri açıkça doğru.\n" +
  "- ambiguous: birden çok şık doğru (tek cevaplı soruda) ya da hiçbir şık doğru değil.\n" +
  "- broken: kök eksik, çelişkili ya da çözmek için gereken bilgi soruda yok (ekranda olmayan şekle/tabloya atıf).\n" +
  "- typo: sayıyı, birimi ya da anlamı bozan yazım hatası.\n" +
  "Hata DEĞİL: sorunun zor olması, öğrencinin yanlış cevabı, ders notuna özgü bir tanım ya da sınıflandırma, anlamı " +
  "bozmayan küçük yazım hatası. Emin değilsen valid=false de; yanlış bir 'hatalı' kararı doğru soruyu siler.\n" +
  "Yalnız JSON döndür: {\"solved\": \"kendi çözümün, tek cümle\", \"valid\": true|false, " +
  "\"kind\": \"key\"|\"ambiguous\"|\"broken\"|\"typo\"|\"none\", \"correctOptions\": [\"doğru şıkkın metni, şıklardan " +
  "BİREBİR\"] (yalnız kind key ise), \"explanation\": \"öğrenciye bir-iki sade Türkçe cümle: neden hatalı ya da neden " +
  "doğru\"}.";

const letter = (index: number) => String.fromCharCode(65 + index);

export function reportCheckUserPrompt(question: ReportedQuestion, reason: ReportReason, note: string | null): string {
  const lines = [`Soru: ${question.text}`];
  if (question.type === "choice") {
    lines.push("Şıklar:");
    question.options.forEach((option, index) => lines.push(`${letter(index)}) ${option}`));
    const marked = question.correct
      .map((answer) => {
        const index = question.options.findIndex((option) => answerKey(option) === answerKey(answer));
        return index >= 0 ? `${letter(index)}) ${question.options[index]}` : answer;
      })
      .join(" · ");
    lines.push(`${question.multi ? "Çok cevaplı. " : ""}İşaretli doğru cevap: ${marked || "(yok)"}`);
  } else {
    lines.push("Soru türü: açık uçlu.");
    if (question.modelAnswer) lines.push(`Beklenen cevap: ${question.modelAnswer}`);
    if (question.rubric?.length) lines.push(`Ölçütler: ${question.rubric.join(" · ")}`);
  }
  if (question.explanation) lines.push(`Açıklama: ${question.explanation}`);
  if (question.steps?.length) lines.push(`Çözüm adımları: ${question.steps.join(" → ")}`);
  lines.push(`Öğrencinin bildirimi: ${reportReasonLabel(reason)}${note ? ` — "${note}"` : ""}`);
  return lines.join("\n");
}

const KINDS = new Set<ReportIssueKind>(["key", "ambiguous", "broken", "typo", "none"]);

/** Modelin cevabını okur; tutarsız karar güvenli yana (hata yok) düşer. */
export function readReportDecision(raw: unknown, question: ReportedQuestion): ReportDecision | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.valid !== "boolean") return null;
  const explanation = typeof data.explanation === "string" ? data.explanation.replace(/\s+/g, " ").trim().slice(0, 420) : "";
  const kindRaw = typeof data.kind === "string" ? (data.kind.trim().toLowerCase() as ReportIssueKind) : "none";
  const kind: ReportIssueKind = KINDS.has(kindRaw) ? kindRaw : "none";
  if (!data.valid || kind === "none") return { valid: false, kind: "none", action: "none", correctedKey: null, explanation };

  if (kind === "key" && question.type === "choice") {
    const wanted = Array.isArray(data.correctOptions) ? data.correctOptions.map((item) => String(item)) : [];
    const resolved = resolveOptions(question.options, wanted);
    // Düzeltme ancak şıklardan birebir seçilmiş, mevcut anahtardan farklı ve soru türüne uygun bir anahtarsa.
    const fits = resolved.length > 0 && (question.multi || resolved.length === 1);
    if (fits && !sameOptionSet(resolved, question.correct)) {
      return { valid: true, kind, action: "fix", correctedKey: resolved, explanation };
    }
  }
  return { valid: true, kind, action: "void", correctedKey: null, explanation };
}

/** Modelin yazdığı şıkları sorunun kendi şıklarına bağlar: tam metin ya da yalnız harf ("B", "B)"). */
function resolveOptions(options: string[], wanted: string[]): string[] {
  const out: string[] = [];
  for (const item of wanted) {
    const key = answerKey(item);
    let match = options.find((option) => answerKey(option) === key);
    if (!match) {
      const bare = /^\(?([A-Fa-f])\)?[).:]?$/.exec(key);
      const lettered = /^\(?([A-Fa-f])[).:]\s*(.+)$/.exec(key);
      if (bare) match = options[bare[1].toUpperCase().charCodeAt(0) - 65];
      else if (lettered) {
        const candidate = options[lettered[1].toUpperCase().charCodeAt(0) - 65];
        if (candidate && answerKey(candidate) === answerKey(lettered[2])) match = candidate;
      }
    }
    if (match && !out.includes(match)) out.push(match);
  }
  return out;
}
