import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { openaiClient } from "@/lib/ai/openai-client";
import { env } from "@/lib/env";
import { recordUsage } from "@/lib/credits/service";
import { synthesizeLine } from "@/lib/ai/speech";
import { AUDIO_BUCKET } from "@/lib/learning/audio-cache";
import { runWithTeacherModel, type AskJson } from "@/lib/learning/teacher-engine-run";
import {
  VIDEO_FIX_PREFIX,
  VIDEO_VERIFY_SYSTEM,
  parseSketchScript,
  parseVideoScript,
  sketchFixUserPrompt,
  sketchStructureIssues,
  sketchSystem,
  sketchVerifySystem,
  speechText,
  videoFixUserPrompt,
  persistVideoStyle,
  videoImagePrompt,
  videoStructureIssues,
  videoSystem,
  videoUserPrompt,
  videoVerifyUserPrompt,
  type SketchDiagram,
  type SketchScript,
  type VideoInput,
  type VideoScript,
} from "@/lib/learning/video-lesson";

/** Bir sahnenin saklanan hâli: anlatım, resim ve ses yolu, sesin süresi. */
/** keyFact: resmin üstünde büyük yazılan kilit bilgi (18 Ekim 2026; eski videolarda yok). */
/**
 * Çizimli özette `imagePath` boştur. `diagram` / `visualSchema` parametrik SVG verisidir.
 * Eski videolar yalnız resim yolu taşır.
 */
export type StoredVideoScene = {
  narration: string;
  imagePath: string;
  audioPath: string;
  durationMs: number;
  keyFact?: string;
  sceneTitle?: string;
  formula?: string;
  voice?: "ada" | "kerem";
  diagram?: SketchDiagram;
  visualSchema?: SketchDiagram;
};

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

/** Çizimli özet: aynı denetim halkası, resim şeması yok. */
export async function sketchScriptLoop(
  ask: AskJson,
  input: VideoInput,
): Promise<{ script: SketchScript | null; problems: string[] }> {
  let script = parseSketchScript(await ask(sketchSystem(input.mode), videoUserPrompt(input)), input.topicLabel);
  if (!script) return { script: null, problems: ["Senaryo kurulamadı."] };
  const review = async (draft: SketchScript) => {
    const structural = sketchStructureIssues(draft);
    const factual = parseIssues(
      await ask(sketchVerifySystem(input.mode), `${videoUserPrompt(input)}\n\nSENARYO (JSON):\n${JSON.stringify(draft)}`),
    );
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
    const fixed = parseSketchScript(
      await ask(VIDEO_FIX_PREFIX + sketchSystem(input.mode), sketchFixUserPrompt(script, found.all, input)),
      input.topicLabel,
    );
    if (fixed) {
      script = fixed;
      found = await review(script);
    }
  }
  return found.high.length ? { script: null, problems: found.high } : { script, problems: [] };
}

/**
 * Resim modeli merdiveni (24 Ekim 2026 lansman testi): canlıda video ders tümüyle düşüyordu —
 * "400 The model 'gpt-image-1' does not exist." Canlı anahtarın projesi bu modeli görmüyor (yerel anahtar görüyor).
 * Model yok derse sıradaki denenir; çalışan model süreç boyunca hatırlanır, sonraki sahneler ondan başlar.
 */
export const IMAGE_MODEL_FALLBACKS = ["gpt-image-1.5", "gpt-image-1-mini", "gpt-image-2"] as const;
let workingImageModel: string | null = null;

export function imageModelLadder(configured: string, working: string | null = workingImageModel): string[] {
  return [...new Set([working, configured, ...IMAGE_MODEL_FALLBACKS].filter((model): model is string => Boolean(model)))];
}

/** Modelin bu projede olmadığını söyleyen hata (başka bir 400 — ör. parametre — sıradakine geçirmez). */
export function isMissingModelError(error: unknown): boolean {
  const row = error as { status?: unknown; code?: unknown; message?: unknown } | null;
  const message = typeof row?.message === "string" ? row.message : "";
  return row?.status === 404 || row?.code === "model_not_found" || /does not exist|model_not_found|not have access to model/i.test(message);
}

/** Tek sahne resmi. gpt-image modelleri b64 döner; dall-e-3 dikey boyutu farklı. */
async function sceneImage(openai: OpenAI, prompt: string): Promise<{ image: Buffer; model: string }> {
  let lastError: unknown = null;
  for (const model of imageModelLadder(env.OPENAI_IMAGE_MODEL)) {
    try {
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
      if (workingImageModel !== model) {
        workingImageModel = model;
        if (model !== env.OPENAI_IMAGE_MODEL) console.warn("video_image_model_fallback", { configured: env.OPENAI_IMAGE_MODEL, used: model });
      }
      return { image: Buffer.from(b64, "base64"), model };
    } catch (error) {
      if (!isMissingModelError(error)) throw error;
      lastError = error;
    }
  }
  throw lastError ?? new Error("image_model_unavailable");
}

/**
 * Çizimli özetin sahneleri. Resim modeli çağrılmaz.
 * Bütün sahnelerin sesi tek `Promise.all` ile birlikte üretilir.
 */
async function synthesizeSketchReel(
  service: SupabaseClient,
  input: VideoInput & { userId: string },
  script: SketchScript,
  videoId: string,
): Promise<StoredVideoScene[]> {
  const base = `video/${input.userId}/${videoId}`;
  return Promise.all(
    script.scenes.map(async (scene, index): Promise<StoredVideoScene> => {
      const voice = await synthesizeLine(speechText(scene.narration), scene.voice);
      if (!voice) throw new Error("speech_failed");
      const audioPath = `${base}/scene-${index}.mp3`;
      const uploaded = await service.storage.from(AUDIO_BUCKET).upload(audioPath, voice.audio, {
        contentType: "audio/mpeg",
        upsert: true,
      });
      if (uploaded.error) throw new Error("storage_failed");
      await recordUsage(service, {
        userId: input.userId,
        actionCode: "SKETCH_VIDEO_GENERATE",
        model: env.OPENAI_TTS_MODEL,
        tokensIn: voice.chars,
        tokensOut: 0,
      }).catch(() => undefined);
      return {
        narration: scene.narration,
        imagePath: "",
        audioPath,
        durationMs: voice.durationMs,
        sceneTitle: scene.sceneTitle,
        voice: scene.voice,
        diagram: scene.diagram,
        visualSchema: scene.diagram,
        ...(scene.formula ? { formula: scene.formula } : {}),
        ...(scene.keyFact ? { keyFact: scene.keyFact } : {}),
      };
    }),
  );
}

/**
 * Video ders üretimi: kredi bir kez ayrılır. Resimli video VIDEO_GENERATE (280).
 * Çizimli özet SKETCH_VIDEO_GENERATE (25): sahne resmi yok. Senaryo ve ses hazırsa
 * kredi kesinleşir, biri olmazsa iade.
 */
export async function runVideoLesson(
  service: SupabaseClient,
  input: VideoInput & { userId: string; prepId: string; topicId: string | null; idempotencyKey: string },
): Promise<{ ok: true; videoId: string } | { ok: false; status: number; error: string; reasons: string[] }> {
  const sketch = input.renderMode === "sketch_reel";
  const outcome = await runWithTeacherModel(service, {
    userId: input.userId,
    actionCode: sketch ? "SKETCH_VIDEO_GENERATE" : "VIDEO_GENERATE",
    idempotencyKey: input.idempotencyKey,
    label: "teacher_video",
    topic: input.topicLabel,
    work: async (ask) => {
      if (input.renderMode === "sketch_reel") {
        const { script, problems } = await sketchScriptLoop(ask, input);
        if (!script) return { ok: false, reasons: problems };
        const videoId = crypto.randomUUID();
        const scenes = await synthesizeSketchReel(service, input, script, videoId);
        const row = {
          id: videoId,
          user_id: input.userId,
          exam_prep_id: input.prepId,
          topic_id: input.topicId,
          topic_label: input.topicLabel,
          title: script.title,
          scenes,
          duration_ms: scenes.reduce((sum, scene) => sum + scene.durationMs, 0),
        };
        let { error } = await service.from("prep_videos").insert({ ...row, style: "sketch_reel" });
        // Göç `20261027190000` uygulanmadan CHECK sketch_reel'i reddeder. Sahne şeması kaydı çizimli tutar.
        const message = `${error?.code ?? ""} ${error?.message ?? ""}`;
        if (error && /23514|style_check|check constraint/i.test(message)) {
          ({ error } = await service.from("prep_videos").insert({ ...row, style: "whiteboard" }));
        }
        if (error) return { ok: false, reasons: ["save_failed"] };
        return { ok: true, result: videoId, log: { scenes: scenes.length, renderMode: "sketch_reel" } };
      }

      const { script, problems } = await videoScriptLoop(ask, input);
      if (!script) return { ok: false, reasons: problems };

      const openai = openaiClient({ apiKey: env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 1 });
      const videoId = crypto.randomUUID();
      const base = `video/${input.userId}/${videoId}`;
      const scenes = await Promise.all(
        script.scenes.map(async (scene, index): Promise<StoredVideoScene> => {
          const [picture, voice] = await Promise.all([
            sceneImage(openai, videoImagePrompt(scene, input.style)),
            // Anahtar kelime işareti (**…**) seslendirilmez.
            synthesizeLine(speechText(scene.narration), "ada"),
          ]);
          if (!voice) throw new Error("speech_failed");
          const { image, model: imageModel } = picture;
          const imageType = imageModel.startsWith("dall-e") ? "png" : "webp";
          const imagePath = `${base}/scene-${index}.${imageType}`;
          const audioPath = `${base}/scene-${index}.mp3`;
          const [up1, up2] = await Promise.all([
            service.storage.from(AUDIO_BUCKET).upload(imagePath, image, { contentType: `image/${imageType}`, upsert: true }),
            service.storage.from(AUDIO_BUCKET).upload(audioPath, voice.audio, { contentType: "audio/mpeg", upsert: true }),
          ]);
          if (up1.error || up2.error) throw new Error("storage_failed");
          await Promise.all([
            recordUsage(service, { userId: input.userId, actionCode: "VIDEO_GENERATE", model: imageModel, tokensIn: 1, tokensOut: 0 }),
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
        style: persistVideoStyle(input.style),
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
