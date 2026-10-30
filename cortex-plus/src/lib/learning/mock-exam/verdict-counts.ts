/**
 * Yazılı denemenin doğru / kısmen / yanlış / boş sayısı TEK yerden (30 Ekim 2026, Paket I #7).
 *
 * Canlıda aynı denemenin yanlış sayısı sonuçta 13, incelemede 14-15 çıktı: notlandırma "toplam − doğru − boş" diye
 * kısmen doğruyu yanlışa katıyordu, inceleme ekranı boşu yanlış sayıyordu, sonuç sayfası ikisini ayırıyordu. Artık
 * üçü de bu işlevi okur; dört sayının toplamı her zaman soru sayısıdır.
 */

export type ExamVerdict = "dogru" | "kismen" | "yanlis" | "bos";

export type VerdictRow = {
  verdict?: string | null;
  is_correct?: boolean | null;
  user_answer?: string | string[] | null;
};

/** Kayıtlı satırın kararı; eski satırda `verdict` yoksa doğruluk ve cevaptan. Satır yoksa boş. */
export function rowVerdict(row: VerdictRow | null | undefined): ExamVerdict {
  if (!row) return "bos";
  const verdict = row.verdict;
  if (verdict === "dogru" || verdict === "kismen" || verdict === "yanlis" || verdict === "bos") return verdict;
  if (row.is_correct) return "dogru";
  const answer = Array.isArray(row.user_answer) ? row.user_answer.join("") : (row.user_answer ?? "");
  return answer.trim() ? "yanlis" : "bos";
}

export type VerdictCounts = { total: number; correct: number; partial: number; wrong: number; blank: number };

export function verdictCounts(verdicts: readonly ExamVerdict[]): VerdictCounts {
  const counts: VerdictCounts = { total: verdicts.length, correct: 0, partial: 0, wrong: 0, blank: 0 };
  for (const verdict of verdicts) {
    if (verdict === "dogru") counts.correct += 1;
    else if (verdict === "kismen") counts.partial += 1;
    else if (verdict === "bos") counts.blank += 1;
    else counts.wrong += 1;
  }
  return counts;
}

export function rowVerdictCounts(rows: readonly (VerdictRow | null | undefined)[]): VerdictCounts {
  return verdictCounts(rows.map(rowVerdict));
}
