import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { env } from "@/lib/env";
import { recordUsage } from "@/lib/credits/service";
import { synthesizeLine } from "@/lib/ai/speech";
import { AUDIO_BUCKET } from "@/lib/learning/audio-cache";
import { runWithTeacherModel, type AskJson } from "@/lib/learning/teacher-engine-run";
import {
  VIDEO_FIX_PREFIX,
  VIDEO_VERIFY_SYSTEM,
  parseVideoScript,
  speechText,
  videoFixUserPrompt,
  videoImagePrompt,
  videoStructureIssues,
  videoSystem,
  videoUserPrompt,
  videoVerifyUserPrompt,
  type VideoInput,
  type VideoScript,
} from "@/lib/learning/video-lesson";

/** Bir sahnenin saklanan hâli: anlatım, resim ve ses yolu, sesin süresi. */
/** keyFact: resmin üstünde büyük yazılan kilit bilgi (18 Ekim 2026; eski videolarda yok). */
export type StoredVideoScene = { narration: string; imagePath: string; audioPath: string; durationMs: number; keyFact?: string };

type Issue = { scene: number; severity: "high" | "low"; problem: string; fix?: string };

function parseIssues(raw: unknown): Issue[] {
  const list = (raw as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const problem = typeof row.problem === "string" ? row.problem.trim() : "";
    if (!problem) return [];
    return [
      {
        scene: Number(row.scene) || 0,
        severity: row.severity === "low" ? ("low" as const) : ("high" as const),
        problem: problem.slice(0, 300),
        fix: typeof row.fix === "string" ? row.fix.slice(0, 300) : undefined,
      },
    ];
  });
}

/** Senaryo → yapı + kaynak denetimi → en çok bir düzeltme. Yüksek sorun kalırsa video yazılmaz. */
export async function videoScriptLoop(
  ask: AskJson,
  input: VideoInput,
): Promise<{ script: VideoScript | null; problems: string[] }> {
  let script = parseVideoScript(await ask(videoSystem(input.mode), videoUserPrompt(input)), input.topicLabel);
  if (!script) return { script: null, problems: ["Senaryo kurulamadı."] };
  const review = async (draft: VideoScript) => {
    const structural = videoStructureIssues(draft);
    const factual = parseIssues(await ask(VIDEO_VERIFY_SYSTEM, videoVerifyUserPrompt(draft, input)));
    const line = (issue: Issue) => `scenes[${issue.scene}]: ${issue.problem}${issue.fix ? ` → ${issue.fix}` : ""}`;
    return {
      high: [
        ...structural.filter((issue) => issue.severity === "high").map((issue) => issue.problem),
        ...factual.filter((issue) => issue.severity === "high").map(line),
      ],
      all: [...structural.map((issue) => issue.problem), ...factual.map(line)],
    };
  };
  let found = await review(script);
  if (found.all.length) {
    const fixed = parseVideoScript(
      await ask(VIDEO_FIX_PREFIX + videoSystem(input.mode), videoFixUserPrompt(script, found.all, input)),
      input.topicLabel,
    );
    if (fixed) {
      script = fixed;
      found = await review(script);
    }
  }
  return found.high.length ? { script: null, problems: found.high } : { script, problems: [] };
}

/** Tek sahne resmi. gpt-image modelleri b64 döner; dall-e-3 dikey boyutu farklı. */
async function sceneImage(openai: OpenAI, prompt: string): Promise<Buffer> {
  const model = env.OPENAI_IMAGE_MODEL;
  const response = model.startsWith("dall-e")
    ? await openai.images.generate({ model, prompt, size: "1024x1792", n: 1, response_format: "b64_json" })
    : await openai.images.generate({
        model,
        prompt,
        size: "1024x1536",
        quality: "low",
        n: 1,
        output_format: "webp",
        output_compression: 80,
      });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("image_empty");
  return Buffer.from(b64, "base64");
}

/**
 * Video ders üretimi: kredi bir kez ayrılır (VIDEO_GENERATE); senaryo, sahne resimleri ve
 * sahne sesleri hazırsa video kaydedilir ve kredi kesinleşir, biri olmazsa iade.
 */
export async function runVideoLesson(
  service: SupabaseClient,
  input: VideoInput & { userId: string; prepId: string; topicId: string | null; idempotencyKey: string },
): Promise<{ ok: true; videoId: string } | { ok: false; status: number; error: string; reasons: string[] }> {
  const outcome = await runWithTeacherModel(service, {
    userId: input.userId,
    actionCode: "VIDEO_GENERATE",
    idempotencyKey: input.idempotencyKey,
    label: "teacher_video",
    topic: input.topicLabel,
    work: async (ask) => {
      const { script, problems } = await videoScriptLoop(ask, input);
      if (!script) return { ok: false, reasons: problems };

      const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 1 });
      const videoId = crypto.randomUUID();
      const base = `video/${input.userId}/${videoId}`;
      const scenes = await Promise.all(
        script.scenes.map(async (scene, index): Promise<StoredVideoScene> => {
          const [image, voice] = await Promise.all([
            sceneImage(openai, videoImagePrompt(scene, input.style)),
            // Anahtar kelime işareti (**…**) seslendirilmez.
            synthesizeLine(speechText(scene.narration), "ada"),
          ]);
          if (!voice) throw new Error("speech_failed");
          const imageType = env.OPENAI_IMAGE_MODEL.startsWith("dall-e") ? "png" : "webp";
          const imagePath = `${base}/scene-${index}.${imageType}`;
          const audioPath = `${base}/scene-${index}.mp3`;
          const [up1, up2] = await Promise.all([
            service.storage.from(AUDIO_BUCKET).upload(imagePath, image, { contentType: `image/${imageType}`, upsert: true }),
            service.storage.from(AUDIO_BUCKET).upload(audioPath, voice.audio, { contentType: "audio/mpeg", upsert: true }),
          ]);
          if (up1.error || up2.error) throw new Error("storage_failed");
          await Promise.all([
            recordUsage(service, { userId: input.userId, actionCode: "VIDEO_GENERATE", model: env.OPENAI_IMAGE_MODEL, tokensIn: 1, tokensOut: 0 }),
            recordUsage(service, { userId: input.userId, actionCode: "VIDEO_GENERATE", model: env.OPENAI_TTS_MODEL, tokensIn: voice.chars, tokensOut: 0 }),
          ]).catch(() => undefined);
          return { narration: scene.narration, imagePath, audioPath, durationMs: voice.durationMs, ...(scene.keyFact ? { keyFact: scene.keyFact } : {}) };
        }),
      );

      const { error } = await service.from("prep_videos").insert({
        id: videoId,
        user_id: input.userId,
        exam_prep_id: input.prepId,
        topic_id: input.topicId,
        topic_label: input.topicLabel,
        style: input.style,
        title: script.title,
        scenes,
        duration_ms: scenes.reduce((sum, scene) => sum + scene.durationMs, 0),
      });
      if (error) return { ok: false, reasons: ["save_failed"] };
      return { ok: true, result: videoId, log: { scenes: scenes.length } };
    },
  });
  if (!outcome.ok) return outcome;
  return { ok: true, videoId: outcome.result };
}
