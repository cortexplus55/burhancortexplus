/**
 * Ortak havuz ön üretimi (R3 toplu pre-seed). Read-through ile aynı yolu kullanır: doğrulanmış ünite atlanır
 * (0 model çağrısı), eksik ünite üretilir → doğrulanır → havuza yazılır. Maliyet ai_usage_events'e
 * SHARED_CONTENT_* koduyla yazılır.
 *
 *   npx tsx --conditions=react-server scripts/content-pool-seed.ts --program yks-2026-tarih [--grade 9,10] [--dry-run]
 *
 * Gerekli ortam: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, OPENAI_API_KEY, CONTENT_POOL_USER_ID (kullanım
 * kaydının yazılacağı kurucu/sistem hesabı). --dry-run yalnız kapsama ve kimlikleri yazar; veritabanına ve modele dokunmaz.
 */
import { createClient } from "@supabase/supabase-js";
import { poolUnitsForProgram } from "../src/lib/content-pool/keys";
import { openaiLlm } from "../src/lib/content-pool/generate";
import { getUnitContent } from "../src/lib/content-pool/pool";
import { supabasePoolStore } from "../src/lib/content-pool/supabase-store";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const programId = arg("program");
  if (!programId) throw new Error("--program gerekli");
  const grades = arg("grade")?.split(",").map((g) => `${g.trim()}. Sınıf`);
  const units = poolUnitsForProgram(programId, grades ? (title) => grades.some((g) => title.startsWith(g)) : undefined);
  const outcomes = units.reduce((n, u) => n + u.outcomes.length, 0);
  console.log(JSON.stringify({ programId, units: units.length, outcomes }));
  if (process.argv.includes("--dry-run")) {
    for (const u of units) console.log(JSON.stringify({ unit: u.unitId, title: u.unit.title, outcomes: u.outcomes.length, sha256: u.sha256.slice(0, 12) }));
    return;
  }
  const userId = process.env.CONTENT_POOL_USER_ID;
  if (!userId) throw new Error("CONTENT_POOL_USER_ID gerekli");
  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const store = supabasePoolStore(service);
  const llm = openaiLlm();
  let ready = 0;
  for (const u of units) {
    const result = await getUnitContent(u.appUnitId, { store, llm, userId });
    if (result.status === "hit" || result.status === "generated") ready += 1;
    console.log(JSON.stringify({ unit: u.unitId, status: result.status, ms: result.ms, llmCalls: "llmCalls" in result ? result.llmCalls : 0, reason: "reason" in result ? result.reason : undefined }));
  }
  console.log(JSON.stringify({ programId, ready, units: units.length, coverage: units.length ? ready / units.length : 0 }));
  if (ready !== units.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
