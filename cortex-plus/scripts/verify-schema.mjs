/**
 * Canlı şemanın repo migration'larıyla uyuştuğunu doğrular.
 *
 * Çalıştırma: repo kökünden `node scripts/verify-schema.mjs`
 *
 * Neden var: bu projede migration'lar Supabase SQL editöründen elle
 * uygulanıyor (repo geçmişi ile canlı şema geçmişi ayrık, `db push`
 * çalıştırılmamalı). Elle uygulamanın riski, bir migration'ın atlandığının
 * fark edilmemesi — bu betik her fazın "kanıt nesnesini" tek tek arıyor.
 * Çıkış kodu 0 = şema kodla uyumlu.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const env = {};
for (const l of fs.readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const line = (s = "") => console.log(s);
let fail = 0;

async function check(label, fn) {
  try {
    const ok = await fn();
    line(`  ${ok ? "✓" : "✗"}  ${label}`);
    if (!ok) fail += 1;
  } catch (e) {
    line(`  ✗  ${label}  — ${e.message}`);
    fail += 1;
  }
}

// Bir kolonun varlığını, o kolonu seçmeye çalışarak sınıyoruz:
// yoksa PostgREST hata döner.
async function hasColumn(table, column) {
  const { error } = await sb.from(table).select(column).limit(1);
  return !error;
}

line("Faz 1 — kalibrasyon ve hazırlık puanı");
await check("exam_prep_topics.familiarity", () => hasColumn("exam_prep_topics", "familiarity"));
await check("exam_prep_node_attempts.familiarity", () => hasColumn("exam_prep_node_attempts", "familiarity"));
await check("exam_prep_node_attempts.mood", () => hasColumn("exam_prep_node_attempts", "mood"));
await check("exam_preps.readiness_score", () => hasColumn("exam_preps", "readiness_score"));
await check("study_session_moods tablosu", () => hasColumn("study_session_moods", "id"));

line();
line("Faz 2 — günlük bütçe, takvim, lab metrikleri");
await check("credit_wallets.period_allowance", () => hasColumn("credit_wallets", "period_allowance"));
await check("credit_wallets.period_ends_at", () => hasColumn("credit_wallets", "period_ends_at"));
await check("calendar_events tablosu", () => hasColumn("calendar_events", "id"));
await check("lab_app_plays tablosu", () => hasColumn("lab_app_plays", "app_id"));
await check("lab_app_ratings tablosu", () => hasColumn("lab_app_ratings", "user_id"));
await check("lab_app_stats() fonksiyonu", async () => {
  const { error } = await sb.rpc("lab_app_stats");
  return !error;
});

line();
line("Faz 3 — okul ağı");
await check("profiles.school_id", () => hasColumn("profiles", "school_id"));
await check("exam_preps.school_id", () => hasColumn("exam_preps", "school_id"));
await check("exam_preps.visibility", () => hasColumn("exam_preps", "visibility"));
await check("exam_preps.forked_from", () => hasColumn("exam_preps", "forked_from"));
await check("school_summary() fonksiyonu", async () => {
  const { error } = await sb.rpc("school_summary");
  return !error;
});
await check("school_feed() fonksiyonu", async () => {
  const { error } = await sb.rpc("school_feed", { p_limit: 1 });
  return !error;
});
await check("increment_prep_view(uuid,uuid) imzası", async () => {
  const { error } = await sb.rpc("increment_prep_view", {
    p_prep_id: "00000000-0000-0000-0000-000000000000",
    p_viewer: "00000000-0000-0000-0000-000000000000",
  });
  return !error;
});

line();
line("Faz 4 — sunucu tarafı ses");
await check("lesson_audio tablosu", () => hasColumn("lesson_audio", "hash"));
await check("lesson-audio kovası", async () => {
  const { data, error } = await sb.storage.listBuckets();
  return !error && (data ?? []).some((b) => b.id === "lesson-audio");
});

line();
line("Denetim #1 — kaynağa bağlanma");
await check("exam_preps.document_id", () => hasColumn("exam_preps", "document_id"));
await check("match_document_chunks yeni imza (eşik + belge filtresi)", async () => {
  const zeros = new Array(1536).fill(0);
  const { error } = await sb.rpc("match_document_chunks", {
    p_user_id: "00000000-0000-0000-0000-000000000000",
    p_query_embedding: JSON.stringify(zeros),
    p_match_count: 1,
    p_min_similarity: 0.25,
    p_document_id: null,
  });
  return !error;
});

line();
line(fail === 0 ? "SONUÇ: hepsi geçti." : `SONUÇ: ${fail} kontrol BAŞARISIZ.`);
process.exit(fail === 0 ? 0 : 1);
