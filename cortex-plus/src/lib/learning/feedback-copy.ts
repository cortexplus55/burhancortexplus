/**
 * Etkinlik metinleri (P2-6). Doğru cevapta ipucu yazılmaz. Kapı, tekrar ve
 * puan kartı etkinliğin türünü söyler. Ders adı yok; tür yeter.
 */

export function cleanFeedbackText(text: string): string {
  return text
    .replace(/İpucu:\s*/gi, "")
    .replace(/İpucu, denetimin[^.]+\.?\s*/gi, "")
    .replace(/Birimi ne\??/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Doğru cevapta çözüm, yanlışta ipucu. */
export function feedbackKicker(correct: boolean): "Çözüm Mantığı" | "İpucu" {
  return correct ? "Çözüm Mantığı" : "İpucu";
}

export function startActionLabel(kind: string): string {
  if (kind === "podcast") return "Podcast oluştur";
  if (kind === "flashcards" || kind === "cards" || kind === "spaced") return "Kartları Hazırla";
  if (kind === "qa") return "Soru-Cevabı Başlat";
  if (kind === "oral") return "Sözlü Sınavı Başlat";
  if (kind === "written_exam") return "Denemeyi oluştur";
  return "Testi oluştur";
}

export function replayLabel(kind: string): string {
  if (kind === "podcast") return "Yeniden dinle";
  if (kind === "quiz" || kind === "true_false") return "Testi tekrarla";
  if (kind === "oral") return "Sözlüyü tekrarla";
  return "Dersi tekrarla";
}

export function ratingPrompt(kind: string): string {
  if (kind === "quiz" || kind === "true_false") return "Bu testi nasıl buldun?";
  if (kind === "oral") return "Bu sözlüyü nasıl buldun?";
  if (kind === "podcast") return "Bu podcasti nasıl buldun?";
  return "Bu dersi nasıl buldun?";
}

/** Başlık konu ya da kavram; öğrencinin ham cevabı alt satır. */
export function gapLines(gap: {
  claim: string;
  topicLabel?: string | null;
  detail?: string | null;
}): { title: string; detail: string } {
  const topic = gap.topicLabel?.trim() ?? "";
  const claim = gap.claim.trim();
  const detail = gap.detail?.trim() ?? "";
  if (topic) return { title: topic, detail: detail || claim };
  if (detail) return { title: claim || "Bu konu", detail };
  return { title: "Bu konu", detail: claim };
}
