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
  // Doğru/yanlış bir test değil, önerme turu (30 Ekim 2026, canlı tur).
  if (kind === "true_false") return "Önermeleri hazırla";
  return "Testi oluştur";
}

export function replayLabel(kind: string): string {
  if (kind === "podcast") return "Yeniden dinle";
  if (kind === "quiz" || kind === "true_false" || kind === "final_check") return "Testi tekrarla";
  if (kind === "flashcards" || kind === "cards" || kind === "spaced") return "Kartları tekrarla";
  if (kind === "qa") return "Soru-cevabı tekrarla";
  if (kind === "oral") return "Sözlüyü tekrarla";
  return "Dersi tekrarla";
}

export function ratingPrompt(kind: string): string {
  if (kind === "quiz" || kind === "true_false" || kind === "final_check") return "Bu testi nasıl buldun?";
  if (kind === "flashcards" || kind === "cards" || kind === "spaced") return "Bu kartları nasıl buldun?";
  if (kind === "qa") return "Bu soru-cevabı nasıl buldun?";
  if (kind === "oral") return "Bu sözlüyü nasıl buldun?";
  if (kind === "podcast") return "Bu podcasti nasıl buldun?";
  return "Bu dersi nasıl buldun?";
}

function looksLikeChoice(text: string): boolean {
  const value = text.trim();
  if (!value) return true;
  if (/^(doğru|yanlış|dogru|yanlis|evet|hayır|hayir)$/i.test(value)) return true;
  return /^-?\d+(?:[.,]\d+)?(?:\s*°\s*[cCfF])?$/.test(value);
}

/** Başlık konu ve kavram; şık metni ("Doğru", "12 °C") başlık olmaz. */
export function gapLines(gap: {
  claim: string;
  topicLabel?: string | null;
  detail?: string | null;
}): { title: string; detail: string } {
  const topic = gap.topicLabel?.trim() ?? "";
  const claim = gap.claim.trim();
  const detail = gap.detail?.trim() ?? "";
  const concept = looksLikeChoice(claim) ? "" : claim;
  const title = topic && concept ? `${topic} — ${concept.slice(0, 90)}` : topic || "Bu konu";
  const extra = [looksLikeChoice(claim) ? claim : "", detail && detail !== concept ? detail : ""]
    .filter(Boolean)
    .join(" · ");
  return { title, detail: extra };
}
