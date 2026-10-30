/** Yol etkinliği ucunun istek gövdesi (`/api/learning/exam-prep/node`). Alanlar ve varsayılanlar sözleşmedir. */
import "server-only";
import { z } from "zod";
import { PODCAST_LENGTHS } from "@/lib/learning/podcast-episode";

export const bodySchema = z.object({
  prepId: z.string().uuid(),
  nodeId: z.string().uuid(),
  attemptId: z.string().uuid().optional(),
  action: z.enum(["start", "complete", "save", "resume", "review", "grade-check", "progress", "choose", "warm"]).default("start"),
  difficulty: z.enum(["kolay", "orta", "ileri"]).optional(),
  voiceMode: z.boolean().optional(),
  // Ders başında sorulan iki sinyal: konuya aşinalık ve o anki ruh hali.
  familiarity: z
    .enum(["new", "heard", "basics", "good", "confident"])
    .optional(),
  mood: z
    .enum(["ready", "curious", "calm", "neutral", "low_energy", "stressed"])
    .optional(),
  answers: z.record(z.string(), z.unknown()).optional(),
  /** Tek kontrol notlandırma: bölüm indeksi + yanıt. */
  sectionIndex: z.number().int().min(0).optional(),
  /** primary = bölüm sorusu; retry = sunucunun kurduğu tekrar varyantı. */
  variant: z.enum(["primary", "retry"]).optional().default("primary"),
  checkAnswer: z
    .object({
      pick: z.number().int().min(0).optional(),
      text: z.string().max(2000).optional(),
    })
    .optional(),
  /** Stage 8 — stable client keys (v2 only). */
  clientRequestId: z.string().uuid().optional(),
  completeRequestId: z.string().uuid().optional(),
  generationId: z.string().uuid().optional(),
  contentVersion: z.number().int().positive().optional(),
  cursorIndex: z.number().int().min(0).optional(),
  /** Sözlü deneme: 3, 5 veya 8 soru. Yoksa derinlik ayarı durur. */
  oralQuestionCount: z.union([z.literal(3), z.literal(5), z.literal(8)]).optional(),
  oralTopicLabel: z.string().max(400).optional(),
  oralScope: z.enum(["topic", "all"]).optional(),
  /**
   * Sözlüde seçilen konuların konu satırı kimlikleri (30 Ekim 2026). Ad birleşimi ("A, B") ayrıştırılamıyordu:
   * seçilen konu üretime, sonuç başlığına ve kayda aynı kimlikle gider. Göndermeyen eski sekme adla çözülür.
   */
  oralTopicIds: z.array(z.string().max(64)).max(30).optional(),
  /** Ders oluşturma merkezi, düğümün konusu dışında bir konu seçtiyse. */
  activityTopicLabel: z.string().max(400).optional(),
  podcastLength: z.enum(PODCAST_LENGTHS).optional(),
  /** Sunucunun kendi isteği: sıradaki dersi kredi düşmeden önceden yaz. */
  prefetch: z.boolean().optional(),
  /**
   * Isınma yazımı (19 Ekim 2026): öğrenci düğümü açtı, kartlara bakıyor. Önceden yazım
   * hızlı işlemle ve bitmiş eski kayıtlara bakmadan başlar. Yalnız iç istekte anlamlı.
   */
  warm: z.boolean().optional(),
  /** Yeni kurulan hazırlığın ilk dersi (30 Ekim 2026): öğrenci birazdan açıyor, Plus'ta hızlı işlemle yazılır. */
  firstLesson: z.boolean().optional(),
  /**
   * 3: istemci V3 dersi (ekran → blok) okuyor. Göndermeyen eski sekme V2 paketi
   * alır; yayın sırasında açık kalan sayfada ders boş açılmasın (16 Ekim 2026).
   */
  lessonFormat: z.literal(3).optional(),
  /**
   * true: istemci parça parça açılan dersi okuyor (18 Ekim 2026). İlk denetlenmiş kavram
   * yazılınca yanıt döner, kalanlar `action: "progress"` ile gelir.
   */
  lessonStream: z.boolean().optional(),
  /** "Dersi tekrarla": aynı ders yeniden açılır, yeniden yazılmaz (18 Ekim 2026). */
  replay: z.boolean().optional(),
  /** Bitmiş adımın kayıtlı gövdesi. Üretim ve kredi yok (25 Ekim 2026). */
  review: z.boolean().optional(),
  /**
   * İstemci sonucu yoklayabiliyor (30 Ekim 2026, Paket I): sözlü bitirme yanıttan sonra notlanır,
   * yanıt `grading: true` olur. Göndermeyen eski sekme sonucu eskisi gibi yanıtın içinde alır.
   */
  gradingAsync: z.boolean().optional(),
});
