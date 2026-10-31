import { openaiClient } from "@/lib/ai/openai-client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { contentModel } from "@/lib/ai/model-router";
import { readLessonV3, visualBlockText, type LessonV3 } from "@/lib/learning/lesson-v3";
import { parseModelJson } from "@/lib/learning/teaching-standards";

/**
 * Günlük ders kalitesi örneği (23 Ekim 2026, ürün sahibinin kararı: "günlük otomatik kalite örneği; günde
 * birkaç sent"). Dört kör ölçümün öğrenci ve öğrenme gözünü canlıya taşır: her sabah önceki günün
 * derslerinden birkaçı bağımsız bir yargıca (yazar ve denetçiden ayrı istem) puanlatılır, sonuç
 * `lesson_quality_samples`'a (source 'judge') yazılır ve `/admin/beta`'da görünür. Gerileme bir günde görünsün.
 *
 * Yargıç kaynağı görmez: doğruluk denetçinin işi; burada yalnız "konuyu bilmeyen öğrenci bundan öğrenir mi".
 */

export const QUALITY_JUDGE_SYSTEM =
  "Sen deneyimli bir öğretmen ve öğrenme bilimcisin. Konuyu hiç bilmeyen 19-23 yaşında bir sınav öğrencisinin " +
  "okuyacağı bir dersi puanlıyorsun. Her ölçütü 1-10 ver ve dersten kısa alıntıyla gerekçelendir:\n" +
  "clarity: doğal, anlaşılır Türkçe; bozuk ya da tutuk cümle yok.\n" +
  "why: neden ve nasıl anlatılıyor; bilgiler birbirine bağlanıyor, yalnız liste değil.\n" +
  "examples: somut örnek, vaka ya da çözümlü örnek var ve işe yarıyor.\n" +
  "noRepetition: aynı bilgi ekranlarda, kutularda ve özette tekrar tekrar anlatılmıyor (10 = hiç tekrar yok).\n" +
  "questions: sorular kavramı ayırt ettiriyor ya da uygulatıyor; üstteki cümleyi geri sormuyor.\n" +
  "retention: öğrenci ertesi gün ne hatırlar; kilit bilgiler öne çıkıyor.\n" +
  'JSON döndür: {"scores":{"clarity":n,"why":n,"examples":n,"noRepetition":n,"questions":n,"retention":n},' +
  '"worst":"dersi en çok iyileştirecek tek değişiklik, en çok 25 kelime"}. Cömert olma; ortalama bir ders 5-6 alır.';

const SCORE_KEYS = ["clarity", "why", "examples", "noRepetition", "questions", "retention"] as const;

export type JudgeVerdict = { scores: Record<(typeof SCORE_KEYS)[number], number>; total: number; worst: string };

/** Yargıcın cevabı; altı puanın hepsi 1-10 değilse null. `total` 0-100. */
export function parseJudgeVerdict(raw: unknown): JudgeVerdict | null {
  const row = raw as { scores?: Record<string, unknown>; worst?: unknown } | null;
  if (!row?.scores) return null;
  const scores = {} as JudgeVerdict["scores"];
  for (const key of SCORE_KEYS) {
    const value = Number(row.scores[key]);
    if (!Number.isFinite(value) || value < 1 || value > 10) return null;
    scores[key] = Math.round(value);
  }
  const sum = SCORE_KEYS.reduce((acc, key) => acc + scores[key], 0);
  return {
    scores,
    total: Math.round((sum / (SCORE_KEYS.length * 10)) * 1000) / 10,
    worst: typeof row.worst === "string" ? row.worst.trim().slice(0, 300) : "",
  };
}

/** Öğrencinin ekranda gördüğü sırayla düz metin: başlık, metin, kutular, tablolar, sorular, özet. */
export function lessonJudgeText(lesson: LessonV3): string {
  const out: string[] = [`# ${lesson.title}`];
  if (lesson.overview) out.push(lesson.overview);
  lesson.screens.forEach((screen, index) => {
    out.push(`\n## Ekran ${index + 1}: ${screen.heading}`);
    for (const block of screen.blocks) {
      if (block.type === "text") out.push(block.text);
      else if (block.type === "note") out.push(`[${block.note.title}] ${block.note.body}`);
      else if (block.type === "table") out.push(block.table.rows.map((row) => row.join(" | ")).join("\n"));
      else if (block.type === "cards") out.push(block.cards.map((card) => `${card.title}: ${card.body}`).join("\n"));
      else if (block.type === "check") {
        const check = block.check;
        const key = check.options && typeof check.answerIndex === "number" ? check.options[check.answerIndex] : "";
        out.push(`Soru: ${check.prompt}${check.options?.length ? ` (${check.options.join(" / ")}; doğru: ${key})` : ""}`);
      } else if (block.type === "formula") out.push(`Formül: ${block.formula.expression}`);
      else if (block.type === "procedure") out.push(block.procedure.steps.map((step) => `- ${step.label}: ${step.detail}`).join("\n"));
      else if (block.type === "example") out.push(`Çözümlü örnek: ${block.example.prompt} → ${block.example.result ?? ""}`);
      else if (visualBlockText(block)) out.push(visualBlockText(block));
    }
  });
  if (lesson.summary?.length) out.push(`\n## Özet\n${lesson.summary.map((line) => `- ${line}`).join("\n")}`);
  return out.join("\n").slice(0, 24_000);
}

type AttemptRow = {
  id: string;
  user_id: string;
  exam_prep_id: string;
  payload: { type?: string; lesson?: unknown } | null;
  exam_prep_nodes: { title: string | null } | null;
};

/** Önceki 24 saatin derslerinden en çok `count` tanesini (rastgele, daha önce örneklenmemiş) yargıca verir. */
export async function sampleLessonQuality(
  service: SupabaseClient,
  input: { now: Date; count?: number; ask?: (system: string, user: string) => Promise<unknown> },
): Promise<{ sampled: number; skipped: string | null }> {
  const count = Math.max(0, Math.min(input.count ?? 3, 5));
  if (!count) return { sampled: 0, skipped: "count_zero" };
  const since = new Date(input.now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await service
    .from("exam_prep_node_attempts")
    .select("id, user_id, exam_prep_id, payload, exam_prep_nodes(title)")
    .gte("created_at", since)
    .eq("payload->>type", "lesson")
    .limit(60);
  if (error || !Array.isArray(data) || !data.length) return { sampled: 0, skipped: error ? "query_failed" : "no_lessons" };
  const rows = data as unknown as AttemptRow[];
  const { data: done } = await service
    .from("lesson_quality_samples")
    .select("attempt_id")
    .eq("source", "judge")
    .in("attempt_id", rows.map((row) => row.id));
  const seen = new Set(((done ?? []) as { attempt_id: string }[]).map((row) => row.attempt_id));
  const pool = rows.filter((row) => !seen.has(row.id));
  // Rastgele ama günden güne farklı: kayıt kimliğinin bugünle karışık sırası.
  const day = input.now.toISOString().slice(0, 10);
  const order = (id: string) => [...`${day}${id}`].reduce((hash, ch) => (hash * 31 + ch.charCodeAt(0)) >>> 0, 7);
  pool.sort((a, b) => order(a.id) - order(b.id));

  const model = contentModel();
  const ask =
    input.ask ??
    (async (system: string, user: string) => {
      const openai = openaiClient({ apiKey: env.OPENAI_API_KEY, timeout: 90_000, maxRetries: 1 });
      const response = await openai.chat.completions.create({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      console.info("lesson_quality_judge_usage", {
        model,
        tokensIn: response.usage?.prompt_tokens ?? 0,
        tokensOut: response.usage?.completion_tokens ?? 0,
      });
      return parseModelJson(response.choices[0]?.message?.content ?? "");
    });

  let sampled = 0;
  for (const row of pool) {
    if (sampled >= count) break;
    const lesson = readLessonV3(row.payload?.lesson);
    if (!lesson) continue;
    let verdict: JudgeVerdict | null = null;
    try {
      verdict = parseJudgeVerdict(await ask(QUALITY_JUDGE_SYSTEM, lessonJudgeText(lesson)));
    } catch {
      verdict = null;
    }
    if (!verdict) continue;
    const { error: insertError } = await service.from("lesson_quality_samples").insert({
      source: "judge",
      user_id: row.user_id,
      exam_prep_id: row.exam_prep_id,
      attempt_id: row.id,
      topic_label: (row.exam_prep_nodes?.title ?? lesson.title).slice(0, 200),
      scores: verdict.scores,
      total: verdict.total,
      model,
      note: verdict.worst,
      sampled_on: day,
    });
    if (insertError) return { sampled, skipped: "insert_failed" };
    sampled += 1;
  }
  return { sampled, skipped: sampled ? null : "no_valid_lesson" };
}
