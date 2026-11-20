/**
 * Cevap anahtarı taşıyan sütunlar (19 Kasım 2026, Faz 2 denetimi). Tek kaynak: göç
 * `20261119150000_cevap_anahtari_okuma_kapat.sql` bu sütunların tarayıcı rolüne (`authenticated`, `anon`) okuma iznini
 * kapatır; bekçi test (`cevap-anahtari-okuma.test.ts`) göçle bu listeyi karşılaştırır ve öğrenci oturumlu istemciyle bu
 * sütunları okuyan kodu yakalar.
 *
 * Neden: satır güvenliği "satır benimse okurum" diyor, sütun sınırı yok. Açık anahtar tarayıcıda olduğu için oturum açmış
 * öğrenci, uygulamayı atlayıp süren sınavının doğru cevaplarını doğrudan tablodan okuyabiliyordu. Bu sütunları yalnız
 * sunucu (service_role) okur; sunucu sahipliği kendisi denetler (`user_id` süzgeci) ve süren sınavda anahtarı soyar
 * (`stripAnswerKeyForActiveExam`).
 */
export const ANSWER_KEY_COLUMNS = {
  practice_exam_questions: ["correct_answer", "correct_answers", "explanation", "model_answer", "rubric"],
  quiz_questions: ["correct_answer", "explanation"],
  exam_prep_node_attempts: ["payload"],
  exam_prep_intro_attempts: ["payload"],
  exam_prep_lessons: ["content_json", "content_md"],
  exam_prep_podcasts: ["listening_check"],
  prep_duels: ["questions"],
} as const satisfies Record<string, readonly string[]>;

export type AnswerKeyTable = keyof typeof ANSWER_KEY_COLUMNS;

/** Süren (teslim edilmemiş) sınavda öğrenciye giden soru: metin, şıklar, tür ve puan. Anahtar alanı yok. */
export type ActiveExamQuestion = {
  id: string;
  text: string;
  options: string[];
  question_type: string;
  points: number;
};

/**
 * Süren sınav için soru satırını soyar: doğru cevap, açıklama, örnek çözüm ve rubrik hiçbir koşulda dönmez. Satırda bu
 * alanlar olsa da (yanlışlıkla geniş seçilmiş sorgu) çıktıya taşınmaz; şık dizisi olmayan değer boş diziye iner.
 */
export function stripAnswerKeyForActiveExam(row: Record<string, unknown>): ActiveExamQuestion {
  const options = Array.isArray(row.options) ? row.options.filter((item): item is string => typeof item === "string") : [];
  const points = typeof row.points === "number" && Number.isFinite(row.points) ? row.points : 1;
  return {
    id: String(row.id ?? ""),
    text: typeof row.question_text === "string" ? row.question_text : "",
    options,
    question_type: typeof row.question_type === "string" && row.question_type ? row.question_type : "mcq",
    points,
  };
}
