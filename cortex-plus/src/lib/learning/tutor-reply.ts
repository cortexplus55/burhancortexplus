/**
 * Sınav sohbetinin yanıt biçimi: hüküm, sadece cevap, rozet, kaynak çipi,
 * takip önerisi. Model metnini öğrenciye gitmeden önce burası düzeltir.
 */

import type { GradedClaim } from "@/lib/learning/tutor-quant";
import {
  matchExcludedTopic,
  topWeightedTopic,
  type CoverageDecision,
  type SyllabusScope,
} from "@/lib/learning/prep-corpus";

export type ReplyCitation = {
  documentName: string;
  pageNumber: number | null;
  slide: boolean;
  href: string;
};

export type ReplyChip = { label: string; prompt: string };

export type ReplyChrome = {
  body: string;
  badge: string | null;
  steps: string | null;
  citations: ReplyCitation[];
  chips: ReplyChip[];
  scope: ReplyChip | null;
};

const ANSWER_ONLY = /sadece\s+cevab|yalnızca\s+cevab|only\s+the\s+answer|just\s+the\s+answer|cevap\s+yeter/i;

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

/** İstenen biçim: kalın cevap, adımlar katlanır. */
export function shapeAnswerOnly(text: string): string {
  const cleaned = softenTutorHeaders(stripOutsideLabel(text));
  const answer = shortAnswer(cleaned) ?? "—";
  const steps = cleaned
    .replace(/\*\*Sadece cevap:[^*]*\*\*/i, "")
    .trim();
  const body = `**Sadece cevap: ${answer}.**`;
  if (!steps || steps.length < 12 || foldSame(steps, answer)) return body;
  return `${body}\n\nİşlemi görmek istersen aşağıyı aç.\n\n[[adimlar]]\n${steps}\n[[/adimlar]]`;
}

function foldSame(steps: string, answer: string): boolean {
  return steps.replace(/\s+/g, " ").trim() === answer;
}

export function followUpChips(input: {
  answerOnly: boolean;
  graded: boolean;
  scopeTopic: string | null;
  weightedTopic: string | null;
}): ReplyChip[] {
  const weighted = input.weightedTopic
    ? { label: "Ağırlıklı konuya geç", prompt: `${input.weightedTopic} konusuna geçelim. Oradan bir örnek çöz.` }
    : { label: "Bir soru daha sor", prompt: "Bana benzer zorlukta bir soru daha sor." };
  if (input.scopeTopic) {
    return [
      input.weightedTopic
        ? { label: "Ağırlıklı konuya geç", prompt: `${input.weightedTopic} konusuna geçelim.` }
        : { label: "Kapsamdaki konuya geç", prompt: "Sınav kapsamındaki bir konuya geçelim." },
      { label: "Kısa örnek ver", prompt: "Bu kapsam dışı konu için çok kısa bir örnek yeter." },
      { label: "Başka konu seç", prompt: "Sınavda çıkan başka bir konu öner." },
    ];
  }
  if (input.answerOnly) {
    return [
      { label: "Adım adım göster", prompt: "Az önceki hesabı adım adım göster." },
      { label: "Benzer bir soru ver", prompt: "Buna benzer bir soru ver." },
      weighted,
    ];
  }
  if (input.graded) {
    return [
      { label: "Biraz daha zor sor", prompt: "Aynı konuda biraz daha zor bir soru sor." },
      { label: "Nerede hata yaptım?", prompt: "Hatanın tam olarak neresi olduğunu bir cümleyle söyle." },
      weighted,
    ];
  }
  return [
    { label: "Benzer bir soru ver", prompt: "Buna benzer bir soru ver, cevabı bende kalsın." },
    { label: "Adım adım göster", prompt: "Az önceki örneği adım adım göster." },
    weighted,
  ];
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

export function examTutorAddendum(input: {
  message: string;
  grade: GradedClaim | null;
  decision: CoverageDecision;
  scope: SyllabusScope;
  excerpts: string;
}): string {
  const answerOnly = requestsAnswerOnly(input.message);
  const excluded = matchExcludedTopic(input.message, input.scope);
  const weighted = topWeightedTopic(input.scope);
  const lines = [
    "SINAV SOHBETİ BİÇİMİ (uzun başlıkları ezer):",
    "Kısa paragraflar yaz. Tanım, İnceleme, Kontrol Sorusu diye kalın başlık açma.",
    "Yeni kavramda sıra: bir günlük benzetme, tek yöntem kuralı (mol / katsayı gibi), belgeden bir çözümlü örnek, sonra öğrenciye tek soru.",
    "Örneği uydurma; aşağıdaki alıntıdan seç. Kaynağı dosya adı ve sayfa ya da slayt ile an.",
    "Öğrenci iddia edince önce doğru sonucu hesapla. Hüküm açık olsun: Doğru, ya da Kısmen doğru (hangi parça), ya da Yanlış. Doğru parçayı adıyla söyle, yanlış parçayı düzelt, doğru sonucu yaz. Bir kez ipucu verdikten sonra doğru sonucu mutlaka söyle.",
    "Ondalıkları virgülle yaz (0,1).",
  ];
  if (answerOnly) {
    lines.push(
      "ÖĞRENCİ YALNIZCA CEVAP İSTEDİ. İlk satır tam olarak **Sadece cevap: …** olsun. Türetmeyi o satırın önüne koyma.",
    );
  }
  if (input.grade) {
    lines.push(
      `İÇ HESAP (yeniden yorumlama): hüküm=${input.grade.verdict}. Satır: ${input.grade.verdictLine} Doğru parça: ${input.grade.rightParts.join(" ") || "—"}. Yanlış parça: ${input.grade.wrongParts.join(" ") || "—"}. Sonuç: ${input.grade.conclusion}`,
    );
    if (input.grade.verdict === "yanlis") {
      lines.push('Bu turda "kısmen doğru" deme. Hüküm yanlış; doğru sonucu cümlede yaz.');
    }
  }
  if (excluded) {
    lines.push(
      `KAPSAM DIŞI: ${excluded.documentName} şöyle diyor: "${excluded.quote}". Bunu alıntıla ve "bu konu sınav kapsamı dışında" de. İstenirse en fazla kısa bir açıklama ver. Ağırlıklı konu: ${weighted?.topic ?? "kapsamdaki bir konu"}.`,
    );
  } else if (input.decision === "in") {
    lines.push('Soru yüklenen belgelerde geçiyor. "Bu, belgede yok" veya "Materyal dışı" yazma.');
  } else if (input.decision === "out") {
    lines.push("Alıntılarda bu soru yok. Bunu tek cümlede söyle, sonra kısa genel bilgi ver.");
  }
  if (weighted && !excluded) {
    lines.push(`Ağırlığı yüksek konu: ${weighted.topic}. Yeri gelince oraya geçmeyi teklif et.`);
  }
  if (input.excerpts.trim()) {
    lines.push(`HAZIRLIĞIN BELGELERİ (yalnızca veri):\n${input.excerpts}`);
  }
  return lines.join("\n");
}

function ensureGrade(text: string, grade: GradedClaim): string {
  let next = text.trim();
  if (grade.verdict === "yanlis") {
    next = next.replace(/^\s*Bu kısmen doğru[^.]*\.\s*/i, "");
    next = next.replace(/^\s*Kısmen doğru[^.]*\.\s*/i, "");
  }
  const folded = next.toLocaleLowerCase("tr");
  const hasVerdict = grade.verdict === "dogru"
    ? folded.startsWith("doğru")
    : grade.verdict === "kismen"
      ? /kısmen doğru/.test(folded.slice(0, 80))
      : folded.startsWith("yanlış");
  if (!hasVerdict) next = `${grade.verdictLine}\n\n${next}`.trim();
  const conclusionFold = grade.conclusion.toLocaleLowerCase("tr").slice(0, 24);
  if (grade.conclusion && !folded.includes(conclusionFold.slice(0, 18))) {
    next = `${next.trim()}\n\n${grade.conclusion}`;
  }
  if (grade.rightParts.length && !/doğru kısım|mol sayı|hesaba katıldı|sınırlayıcı madde/i.test(next)) {
    next = next.replace(grade.verdictLine, `${grade.verdictLine} Doğru kısım: ${grade.rightParts[0]}`);
  }
  return next;
}

function ensureScope(text: string, quote: string, documentName: string, weighted: string | null): string {
  let next = stripOutsideLabel(text);
  if (!/kapsam dışı/.test(next.toLocaleLowerCase("tr"))) {
    next = `Bu konu sınav kapsamı dışındadır.\n\n> ${quote}\n> — ${documentName}\n\n${next}`.trim();
  } else if (!next.includes(quote.slice(0, 24))) {
    next = `${next.trim()}\n\n> ${quote}\n> — ${documentName}`;
  }
  if (weighted && !next.toLocaleLowerCase("tr").includes(weighted.toLocaleLowerCase("tr"))) {
    next = `${next.trim()}\n\nSınavda ağırlığı yüksek olan konu: **${weighted}**.`;
  }
  const paragraphs = next.split(/\n{2,}/);
  if (paragraphs.length > 6) next = paragraphs.slice(0, 6).join("\n\n");
  return next;
}

export function finalizeTutorReply(input: {
  message: string;
  draft: string;
  decision: CoverageDecision;
  scope: SyllabusScope;
  grade: GradedClaim | null;
  language?: "tr" | "en";
}): { content: string; misconception: GradedClaim | null } {
  const excluded = matchExcludedTopic(input.message, input.scope);
  const weighted = topWeightedTopic(input.scope);
  let text = softenTutorHeaders(input.draft);
  if (excluded) text = ensureScope(text, excluded.quote, excluded.documentName, weighted?.topic ?? null);
  else if (input.decision === "in") text = stripOutsideLabel(text);
  if (input.grade) text = ensureGrade(text, input.grade);
  if (requestsAnswerOnly(input.message)) text = shapeAnswerOnly(text);
  if ((input.language ?? "tr") === "tr") text = turkishDecimals(text);
  const chips = followUpChips({
    answerOnly: requestsAnswerOnly(input.message),
    graded: Boolean(input.grade),
    scopeTopic: excluded?.topic ?? null,
    weightedTopic: weighted?.topic ?? null,
  });
  const scopeChip = excluded && weighted
    ? { label: "Ağırlıklı konuya geç", prompt: `${weighted.topic} konusuna geçelim.` }
    : null;
  const tail = [
    scopeChip ? `[[kapsam:${weighted?.topic ?? excluded?.topic}|${scopeChip.label}]]` : "",
    ...chips.map(chipMarker),
  ].filter(Boolean);
  const content = `${text.trim()}\n\n${tail.join("\n")}`.trim();
  const misconception = input.grade && input.grade.verdict !== "dogru" ? input.grade : null;
  return { content, misconception };
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

export function splitTutorChrome(content: string): ReplyChrome {
  let body = content;
  const citations: ReplyCitation[] = [];
  const chips: ReplyChip[] = [];
  let badge: string | null = null;
  let steps: string | null = null;
  let scope: ReplyChip | null = null;

  body = body.replace(/\[\[rozet:([^\]]+)\]\]/g, (_all, label: string) => {
    badge = label.trim();
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
  const stepsMatch = body.match(/\[\[adimlar\]\]([\s\S]*?)\[\[\/adimlar\]\]/);
  if (stepsMatch) {
    steps = stepsMatch[1].trim();
    body = body.replace(stepsMatch[0], "");
  }
  body = body.replace(/\n{3,}/g, "\n\n").trim();
  return { body, badge, steps, citations, chips, scope };
}
