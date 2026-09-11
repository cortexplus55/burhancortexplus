// Explicit manual probe; never runs in the unit suite or at build time.
// Run from cortex-plus with: node --env-file=.env.local scripts/probe-educational-gate.mjs
// Uses a synthetic source by default; --prep reads an authorized test preparation.
// Logs shape/status only. Does not save attempts or alter application credits.
import OpenAI from "openai";
import { createServer } from "vite";
import { createClient } from "@supabase/supabase-js";

const server = await createServer({ configFile: "vitest.config.ts", server: { middlewareMode: true } });
try {
  const { verifyEducationalContent } = await server.ssrLoadModule("/src/lib/ai/quality-gate.ts");
  const { trueFalseItemsSchema, TRUE_FALSE_FORMAT } = await server.ssrLoadModule("/src/lib/learning/true-false.ts");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45000, maxRetries: 0 });
  let context = "Kaynak: Bir tam tur 360 derece veya 2π radyandır. 180 derece π radyandır. Radyan ölçüsü yay uzunluğunun yarıçapa oranıdır. Pozitif açılar saat yönünün tersine ölçülür. Bu kaynaktan 8 doğru/yanlış önermesi üret.";
  let model = process.env.OPENAI_ADVANCED_MODEL;
  const prepIndex = process.argv.indexOf("--prep");
  if (prepIndex >= 0) {
    // Explicit use only for an authorized existing test preparation.
    if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname !== "dgjfyewgrukglsehyntc.supabase.co") throw new Error("wrong_project");
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
    const { data: prep, error } = await db.from("exam_preps").select("user_id,title,document_id,active_topic_id").eq("id", process.argv[prepIndex + 1]).single();
    if (error || !prep) throw new Error("prep_unavailable");
    const { data: topic } = await db.from("exam_prep_topics").select("label").eq("id", prep.active_topic_id).single();
    const { loadSourceContext } = await server.ssrLoadModule("/src/lib/learning/source-context.ts");
    const { isPremiumUser } = await server.ssrLoadModule("/src/lib/ai/generate.ts");
    const { selectModel } = await server.ssrLoadModule("/src/lib/ai/model-router.ts");
    const source = await loadSourceContext(db, prep.user_id, `${prep.title} ${topic?.label ?? ""}`, { documentId: prep.document_id });
    model = selectModel({ actionCode: "QUIZ_GENERATE", isPremium: await isPremiumUser(db, prep.user_id), hasImage: false }).model;
    context = `Sınav: ${prep.title}. Konu: ${topic?.label}. Zorluk: orta. ${source.block} 8 doğru/yanlış önermesi. ${TRUE_FALSE_FORMAT}`;
    console.log({ stage: "source", matches: source.matches.length, model });
  }
  const format = 'JSON: {"items":[{"text":string,"correct":boolean,"explanation":string,"correctedStatement":string}]} ' + TRUE_FALSE_FORMAT;
  const response = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: format }, { role: "user", content: context }],
  });
  const draft = response.choices[0]?.message?.content ?? "{}";
  const validate = content => {
    try {
      const result = trueFalseItemsSchema.safeParse(JSON.parse(content).items);
      return result.success ? [] : result.error.issues.map(issue => issue.message);
    } catch { return ["Geçerli JSON gerekli."]; }
  };
  console.log({ stage: "draft", issues: validate(draft) });
  const verified = await verifyEducationalContent({ client, context, draft, format, validate });
  console.log({ stage: "verified", valid: validate(verified.content).length === 0, tokensIn: verified.tokensIn, tokensOut: verified.tokensOut });
} catch (error) {
  console.error({ stage: "failed", name: error?.name, reason: error?.reason, status: error?.status });
  process.exitCode = 1;
} finally {
  await server.close();
}
