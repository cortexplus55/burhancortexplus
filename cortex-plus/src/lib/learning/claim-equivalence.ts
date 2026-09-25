import "server-only";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import {
  parseEquivalenceVerdicts,
  type ContradictionCandidate,
  type EquivalenceVerdict,
} from "@/lib/learning/source-contradictions";

export { parseEquivalenceVerdicts };

/**
 * Aday çiftler için tek ucuz kontrol. Öğrenciye ayrıca kredi yazılmaz:
 * belge zaten işlenmiş, bu yalnızca yanlış "çelişki"yi elemek içindir.
 * Emin değilse çelişki gösterilmez.
 */

const RUBRIC = [
  "İki kaynak aynı kavram için çelişiyor mu?",
  "conflict YALNIZCA aynı koşullarda bağdaşmayan iddialarda: aynı büyüklüğün farklı sayı/birimi, zıt doğruluk, aynı olayın farklı yılı.",
  "same: parafraz, biri daha ayrıntılı, yaklaşık/yuvarlama, eşdeğer tanım (12 g karbon-12 ile 6,02×10^23 tanecik gibi), açıkça farklı koşullardaki değerler (0 °C ile 25 °C).",
  "Emin değilsen unsure. Çelişkiyi tercih etme.",
].join(" ");

export async function judgeEquivalence(
  _service: SupabaseClient,
  _userId: string,
  candidates: ContradictionCandidate[],
): Promise<EquivalenceVerdict[]> {
  const unsure = candidates.map(() => "unsure" as const);
  if (!candidates.length || !env.OPENAI_API_KEY) return unsure;
  const lines = candidates.map((candidate, index) => {
    const [left, right] = candidate.item.claims;
    return `${index}. kavram: ${candidate.item.concept}\nA (${left?.fileName ?? "kaynak"}): ${left?.value ?? ""}\nB (${right?.fileName ?? "kaynak"}): ${right?.value ?? ""}`;
  });
  try {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 12_000, maxRetries: 0 });
    const response = await client.chat.completions.create({
      model: env.OPENAI_STANDARD_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${RUBRIC} JSON: {"verdicts":["same"|"conflict"|"unsure"]} sırayı koru.` },
        { role: "user", content: lines.join("\n\n") },
      ],
    });
    const text = response.choices[0]?.message?.content ?? "";
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    return parseEquivalenceVerdicts(parsed, candidates.length);
  } catch {
    return unsure;
  }
}
