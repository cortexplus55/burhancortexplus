#!/usr/bin/env node
/**
 * E2E test hesapları (Faz 0, 2.5). Canlı veritabanıyla ortak: yalnız `e2e-…@e2e.cortexplus.test` adresli, `app_metadata.e2e`
 * işaretli hesaplara yazar; başka hiçbir kullanıcının satırını okumaz ya da değiştirmez.
 *
 *   node scripts/seed-e2e-users.mjs              # açar ya da günceller (idempotent; testlerden önce yeniden çalıştırın)
 *   node scripts/seed-e2e-users.mjs --remove     # bu hesapların hepsini ve satırlarını siler
 *   node scripts/seed-e2e-users.mjs --dry-run    # yalnız ne yapacağını söyler
 *   node scripts/seed-e2e-users.mjs --only=e2e-plus,e2e-week
 *
 * Kurallar (ürün sahibinin 14 Kasım 2026 kararları, A seçeneği):
 *  - Hesap yönetici API'siyle, e-posta GÖNDERMEYEN yolla açılır (`email_confirm: true`). `.test` alan adı hiçbir posta
 *    kutusuna gidemez (RFC 2606).
 *  - Parola rastgele; yalnız `tests/.auth/e2e-users.local.json` dosyasında durur (gitignore'da). Ekrana, kayda yazılmaz.
 *  - E-posta tetikleyen her alan baştan kapalı ya da "gönderildi" işaretli (05-test-hesaplari.md, "Sessiz hesap").
 *  - e2e-founder gerçek kurucu satırı ALMAZ: kurucu ekranları fikstürle ölçülür (`/e2e/kurucu`, `?plan=kurucu`).
 *  - Servis anahtarı yalnız yerel ortamdan (`.env.local`, `SUPABASE_SECRET_KEY`) okunur; yoksa betik çalışmaz.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
nextEnv.loadEnvConfig(ROOT, false, { info() {}, error: console.error });

const args = process.argv.slice(2);
const REMOVE = args.includes("--remove");
const DRY = args.includes("--dry-run");
const ONLY = (args.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").map((s) => s.trim()).filter(Boolean);

export const E2E_DOMAIN = "e2e.cortexplus.test";
const SECRET_FILE = path.join(ROOT, "tests/.auth/e2e-users.local.json");
const STATE_FILE = path.join(ROOT, "tests/.auth/e2e-state.json");
const DAY_MS = 86_400_000;

/** 9 test kullanıcısının 8'i gerçek hesap; e2e-founder fikstürde (yukarıdaki not). */
export const E2E_USERS = [
  { name: "e2e-free-fresh", label: "Ücretsiz Yeni", plan: "free", lesson: "open" },
  { name: "e2e-free-used", label: "Ücretsiz Kullanmış", plan: "free", lesson: "done", meters: { chat: 1 } },
  { name: "e2e-free-exhausted", label: "Ücretsiz Dolu", plan: "free", lesson: "open", meters: { chat: 3, photo: 1 } },
  { name: "e2e-plus", label: "Plus", plan: "plus-aylik", used: 0, document: true },
  { name: "e2e-plus-90", label: "Plus Doksan", plan: "plus-aylik", used: 0.9 },
  { name: "e2e-plus-100", label: "Plus Yüz", plan: "plus-aylik", used: 1 },
  { name: "e2e-week", label: "Sınav Haftası", plan: "plus-haftalik", used: 0, daysLeft: 3 },
  { name: "e2e-sigma", label: "Sigma", plan: "sigma-aylik", used: 0 },
];
export const E2E_FIXTURE_ONLY = ["e2e-founder"];

const PREP_TITLE = "E2E Hazırlık · TYT Matematik";
const PREP_TOPICS = ["Sayı Kümeleri", "Üslü Sayılar", "Köklü Sayılar"];

function die(message, code = 1) {
  console.error(message);
  process.exit(code);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SECRET_KEY?.trim();
if (!url || !key) die("SUPABASE_SECRET_KEY ya da NEXT_PUBLIC_SUPABASE_URL yerelde yok; betik çalışmadı. Anahtarı ürün sahibinden isteyin.", 2);
const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(url)?.[1];
if (!ref) die("NEXT_PUBLIC_SUPABASE_URL beklenen biçimde değil (https://<ref>.supabase.co).", 2);

const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const emailOf = (name) => `${name}@${E2E_DOMAIN}`;
const isMissingTable = (error) => error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? ""));

function strongPassword() {
  const pick = (set) => set[crypto.randomInt(set.length)];
  const body = crypto.randomBytes(24).toString("base64url");
  return pick("ABCDEFGHJKLMNPQRSTUVWXYZ") + pick("abcdefghijkmnopqrstuvwxyz") + pick("23456789") + pick("!#%+=?@") + body;
}

function loadSecrets() {
  try {
    const data = JSON.parse(fs.readFileSync(SECRET_FILE, "utf8"));
    return data && typeof data === "object" && data.users ? data : { version: 1, users: {} };
  } catch {
    return { version: 1, users: {} };
  }
}

function saveSecrets(secrets) {
  fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
  fs.writeFileSync(SECRET_FILE, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
}

function istanbulDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function isoWeekKey(now = new Date()) {
  const [y, m, d] = istanbulDay(now).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const year = date.getUTCFullYear();
  const week = Math.ceil(((date.getTime() - Date.UTC(year, 0, 1)) / DAY_MS + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Yalnız bu adresin kimliği (başka kullanıcı okunmaz): SQL `admin_user_id_by_email`, service_role. */
async function userIdByEmail(email) {
  const { data, error } = await service.rpc("admin_user_id_by_email", { p_email: email });
  if (error) throw new Error(`kimlik okunamadı (${error.code ?? "?"})`);
  return typeof data === "string" ? data : null;
}

async function ownedTestUser(name) {
  const id = await userIdByEmail(emailOf(name));
  if (!id) return null;
  const { data, error } = await service.auth.admin.getUserById(id);
  if (error || !data?.user) throw new Error(`${name}: hesap okunamadı`);
  if (data.user.app_metadata?.e2e !== true) throw new Error(`${name}: adres var ama e2e işareti yok; dokunulmadı`);
  return data.user;
}

async function must(label, promise) {
  const { error, data } = await promise;
  if (error && !isMissingTable(error)) throw new Error(`${label}: ${error.code ?? ""} ${error.message ?? ""}`.trim());
  return data;
}

async function upsertAccount(spec, secrets) {
  const email = emailOf(spec.name);
  const stored = secrets.users[spec.name];
  const password = stored?.password ?? strongPassword();
  const attrs = {
    password,
    email_confirm: true,
    app_metadata: { e2e: true, e2e_user: spec.name },
    user_metadata: { full_name: `E2E ${spec.label}` },
  };
  const existing = await ownedTestUser(spec.name);
  let id;
  if (existing) {
    const { error } = await service.auth.admin.updateUserById(existing.id, attrs);
    if (error) throw new Error(`${spec.name}: güncellenemedi (${error.code ?? error.status ?? "?"})`);
    id = existing.id;
  } else {
    const { data, error } = await service.auth.admin.createUser({ email, ...attrs });
    if (error || !data?.user) throw new Error(`${spec.name}: açılamadı (${error?.code ?? error?.status ?? "?"})`);
    id = data.user.id;
  }
  secrets.users[spec.name] = { email, password };
  return id;
}

async function seedProfile(id, spec) {
  const { data: profile } = await service.from("profiles").select("id, onboarding_completed_at").eq("id", id).maybeSingle();
  const fields = {
    full_name: `E2E ${spec.label}`,
    grade_level: "12",
    primary_role: "student",
    study_reminder_email: false,
    deleted_at: null,
    onboarding_completed_at: profile?.onboarding_completed_at ?? new Date().toISOString(),
  };
  if (profile) await must("profil", service.from("profiles").update(fields).eq("id", id));
  else await must("profil", service.from("profiles").insert({ id, ...fields }));
}

/** Hoş geldin ve davet e-postası "gönderildi" sayılır (`once:` işareti); cron ve kurulum hiç göndermez. */
async function silenceMail(id) {
  for (const template of ["once:welcome", "once:referral_invite"]) {
    const { data } = await service.from("email_events").select("id").eq("user_id", id).eq("template_key", template).limit(1);
    if (!data?.length) await must(template, service.from("email_events").insert({ user_id: id, template_key: template, status: "sent" }));
  }
  await must("anket", service.from("weekly_surveys").upsert({ user_id: id, week_key: isoWeekKey(), dismissed: true }, { onConflict: "user_id,week_key", ignoreDuplicates: true }));
  await must("bildirimler", service.from("notifications").delete().eq("user_id", id));
  await must("cihazlar", service.from("user_device_sessions").delete().eq("user_id", id));
}

async function planRow(slug) {
  const { data, error } = await service.from("plans").select("id, slug, billing_period, monthly_allowance").eq("slug", slug).maybeSingle();
  if (error || !data) throw new Error(`plan bulunamadı: ${slug}`);
  return data;
}

async function seedPlan(id, spec, now) {
  await must("cüzdan", service.from("credit_wallets").upsert({ user_id: id, balance: 0, reserved: 0 }, { onConflict: "user_id", ignoreDuplicates: true }));
  const { data: subs } = await service.from("subscriptions").select("id, updated_at").eq("user_id", id).order("updated_at", { ascending: false });
  const stamp = now.toISOString();

  if (spec.plan === "free") {
    if (subs?.length) await must("abonelik", service.from("subscriptions").update({ status: "inactive", updated_at: stamp }).eq("user_id", id));
    await must("cüzdan", service.from("credit_wallets").update({ balance: 0, free_allowance_remaining: 0, updated_at: stamp }).eq("user_id", id));
    return;
  }

  const plan = await planRow(spec.plan);
  const weekly = plan.billing_period === "weekly";
  const allowance = Number(plan.monthly_allowance) > 0 ? Number(plan.monthly_allowance) : 7200;
  // Haftalık plan "N gün kaldı" gösterir (yukarı yuvarlar): bitiş tam N gün eksi bir dakika sonra.
  const end = spec.daysLeft ? new Date(now.getTime() + spec.daysLeft * DAY_MS - 60_000) : new Date(now.getTime() + (weekly ? 7 : 30) * DAY_MS);
  const start = new Date(end.getTime() - (weekly ? 7 : 30) * DAY_MS);
  const sub = {
    plan_id: plan.id,
    status: "active",
    billing_period: plan.billing_period ?? "monthly",
    current_period_start: start.toISOString(),
    current_period_end: end.toISOString(),
    trial_until: null,
    cancel_at_period_end: false,
    auto_renew: false,
    // Sessiz hesap: dönem sonu hatırlatması ve bitiş bildirimi "gönderildi" sayılır (subscription-renewal cron'u).
    renewal_reminder_sent_at: stamp,
    expired_notified_at: stamp,
    updated_at: stamp,
  };
  if (subs?.length) {
    const [latest, ...older] = subs;
    if (older.length) await must("abonelik", service.from("subscriptions").update({ status: "inactive", updated_at: stamp }).in("id", older.map((s) => s.id)));
    await must("abonelik", service.from("subscriptions").update(sub).eq("id", latest.id));
  } else {
    await must("abonelik", service.from("subscriptions").insert({ user_id: id, ...sub }));
  }
  await must(
    "cüzdan",
    service
      .from("credit_wallets")
      .update({
        balance: 0,
        free_allowance_remaining: Math.round(allowance * (1 - spec.used)),
        period_allowance: allowance,
        period_kind: weekly ? "weekly" : "monthly",
        period_ends_at: end.toISOString(),
        updated_at: stamp,
      })
      .eq("user_id", id),
  );
}

async function seedMeters(id, spec, now) {
  await must("sayaçlar", service.from("free_usage").delete().eq("user_id", id));
  const rows = Object.entries(spec.meters ?? {}).map(([meter, used]) => ({ user_id: id, meter, period_key: istanbulDay(now), used }));
  if (rows.length) await must("sayaçlar", service.from("free_usage").insert(rows));
}

function pathNodes() {
  const nodes = [];
  PREP_TOPICS.forEach((topic, index) => {
    nodes.push({ kind: "lesson", title: topic, day_index: index * 2, sort_order: nodes.length + 1, status: "locked", topic: index });
    nodes.push({ kind: "quiz", title: "Konu testi", day_index: index * 2 + 1, sort_order: nodes.length + 1, status: "locked", topic: index });
  });
  nodes.push({ kind: "written_exam", title: "Yazılı deneme", day_index: PREP_TOPICS.length * 2, sort_order: nodes.length + 1, status: "locked" });
  return nodes;
}

/** Hazırlığın kendi işlevi (`create_exam_prep_graph`, tek işlem) ile; model çağrısı yok. Her koşuda yol aynı duruma döner. */
async function seedPrep(id, spec, now) {
  const examDate = new Date(now.getTime() + 45 * DAY_MS).toISOString().slice(0, 10);
  let { data: prep } = await service.from("exam_preps").select("id").eq("user_id", id).eq("title", PREP_TITLE).order("created_at").limit(1).maybeSingle();
  if (!prep) {
    const nodes = pathNodes();
    const { data, error } = await service.rpc("create_exam_prep_graph", {
      p_input: {
        userId: id,
        title: PREP_TITLE,
        examType: "tyt",
        topics: PREP_TOPICS,
        examDate,
        targetScore: 75,
        documentId: null,
        tasks: PREP_TOPICS.map((title, sort_order) => ({ title, due_date: examDate, sort_order })),
        nodes: nodes.map((node) => ({ kind: node.kind, title: node.title, day_index: node.day_index, sort_order: node.sort_order, status: node.status })),
      },
    });
    if (error || typeof data !== "string") throw new Error(`hazırlık açılamadı (${error?.code ?? "?"})`);
    prep = { id: data };
  }
  /* `intro_deferred_at`: yolun başındaki "Seviye tespiti" adımı tanı ertelenince kalkar. Hazırlık sayfasının ilk
     ziyaretindeki arka plan ders isteği bunu kendiliğinden işaretliyordu; ilk ve sonraki ziyaret farklı görünüyordu
     (görsel taban). Tohum hazırlığı doğrudan bu kalıcı hâlde yazar. */
  const { data: introRow } = await service.from("exam_preps").select("intro_deferred_at").eq("id", prep.id).maybeSingle();
  await must(
    "hazırlık",
    service.from("exam_preps").update({ exam_date: examDate, ...(introRow?.intro_deferred_at ? {} : { intro_deferred_at: now.toISOString() }) }).eq("id", prep.id),
  );
  const topics = await must("konular", service.from("exam_prep_topics").select("id, label, sort_order").eq("exam_prep_id", prep.id).order("sort_order"));
  /* Adımlar sıra numarasıyla değil tür + başlıkla eşlenir: hazırlık sayfası ilk açılışta yola eksik adımları ekler
     (`ensurePathSkeletonNodes`) ve sırayı kaydırabilir. Tohumun yazdığı 7 adım dışındakiler kilitli kalır. */
  const all = await must("yol", service.from("exam_prep_nodes").select("id, kind, title, sort_order, session_meta").eq("exam_prep_id", prep.id).order("sort_order"));
  const plan = pathNodes();
  const used = new Set();
  for (const draft of plan) {
    const topic = draft.topic !== undefined ? topics?.[draft.topic] : null;
    const node = (all ?? []).find((n) => !used.has(n.id) && n.kind === draft.kind
      && (draft.kind === "lesson" ? n.title === draft.title : true)
      && (!topic || !n.session_meta?.topicId || n.session_meta.topicId === topic.id));
    if (!node) continue;
    used.add(node.id);
    const first = draft.topic === 0;
    let status = "locked";
    if (first && draft.kind === "lesson") status = spec.lesson === "done" ? "done" : "ready";
    if (first && draft.kind === "quiz" && spec.lesson === "done") status = "ready";
    const patch = { status, ...(topic ? { session_meta: { topicId: topic.id, topicTitle: topic.label } } : {}) };
    await must("yol", service.from("exam_prep_nodes").update(patch).eq("id", node.id));
  }
  const rest = (all ?? []).filter((n) => !used.has(n.id)).map((n) => n.id);
  if (rest.length) await must("yol", service.from("exam_prep_nodes").update({ status: "locked" }).in("id", rest));
  return prep.id;
}

const DOC_NAME = "E2E Ders Notu.txt";
const DOC_TEXT = [
  "Sayı Kümeleri",
  "Doğal sayılar N = {0, 1, 2, ...}; tam sayılar Z; rasyonel sayılar Q = {a/b : a, b tam sayı, b ≠ 0}.",
  "Üslü Sayılar",
  "a^m · a^n = a^(m+n); (a^m)^n = a^(m·n); a^0 = 1 (a ≠ 0).",
  "Köklü Sayılar",
  "√(a·b) = √a · √b (a, b ≥ 0); √(x²) = |x|.",
].join("\n");

/** `/dokumanlar/:id` için sabit belge (yalnız `document: true` hesapta): depo dosyası + satır + tek sayfa metni. */
async function seedDocument(id) {
  const { data: existing } = await service.from("documents").select("id").eq("user_id", id).eq("file_name", DOC_NAME).is("deleted_at", null).limit(1).maybeSingle();
  if (existing) return existing.id;
  const documentId = crypto.randomUUID();
  const storagePath = `${id}/${documentId}/e2e-ders-notu.txt`;
  const body = Buffer.from(DOC_TEXT, "utf8");
  const { error: uploadError } = await service.storage.from("documents").upload(storagePath, body, { contentType: "text/plain", upsert: true });
  if (uploadError) throw new Error(`belge yüklenemedi (${uploadError.message ?? "?"})`);
  await must("belge", service.from("documents").insert({
    id: documentId, user_id: id, file_name: DOC_NAME, storage_path: storagePath, mime_type: "text/plain",
    size_bytes: body.length, status: "completed", page_count: 1,
  }));
  await must("belge sayfası", service.from("document_pages").insert({ document_id: documentId, page_number: 1, text_content: DOC_TEXT }));
  return documentId;
}

// Kaldırmada silinen tablolar: hesap silme işçisinin listesi (`account-deletion.ts`) + bu betiğin yazdıkları.
const PURGE_TABLES = [
  "notifications", "email_events", "weekly_surveys", "free_usage", "user_device_sessions", "consent_records",
  "cookie_consent_events", "email_preferences", "email_campaign_recipients", "study_session_moods", "star_events",
  "open_timings", "exam_prep_review_items", "general_review_cards", "student_learning_memory", "question_reports",
  "exam_wizard_drafts", "explain_attempts", "ai_usage_events", "ai_validation_events", "abuse_events",
  "user_activity_days", "user_streaks", "learning_time", "messages", "conversations", "mistake_entries",
  "practice_exam_attempts", "practice_exams", "quiz_attempts", "quizzes", "flashcard_reviews", "flashcard_sets",
  "calendar_events", "exam_preps", "study_plans", "subscriptions", "credit_reservations", "credit_ledger",
  "credit_wallets", "user_roles",
];

async function removeUser(name) {
  const user = await ownedTestUser(name);
  if (!user) return "yok";
  if (DRY) return "silinecek";
  const { data: docs } = await service.from("documents").select("storage_path").eq("user_id", user.id);
  const paths = (docs ?? []).map((d) => d.storage_path).filter((p) => typeof p === "string" && p.startsWith(`${user.id}/`));
  if (paths.length) await service.storage.from("documents").remove(paths);
  for (const table of ["documents", ...PURGE_TABLES]) {
    const { error } = await service.from(table).delete().eq("user_id", user.id);
    if (error && !isMissingTable(error)) throw new Error(`${name}: ${table} silinemedi (${error.code ?? "?"})`);
  }
  const { error } = await service.auth.admin.deleteUser(user.id, false);
  if (error && error.code !== "user_not_found") throw new Error(`${name}: hesap silinemedi (${error.code ?? error.status ?? "?"})`);
  return "silindi";
}

async function main() {
  const targets = E2E_USERS.filter((u) => !ONLY.length || ONLY.includes(u.name));
  console.log(`Supabase projesi: ${ref} · ${targets.length} hesap · ${REMOVE ? "kaldır" : "aç/güncelle"}${DRY ? " (deneme)" : ""}`);

  if (REMOVE) {
    const secrets = loadSecrets();
    for (const spec of targets) {
      const result = await removeUser(spec.name);
      console.log(`  ${spec.name}: ${result}`);
      if (!DRY) delete secrets.users[spec.name];
    }
    if (!DRY) {
      saveSecrets(secrets);
      for (const spec of targets) fs.rmSync(path.join(ROOT, `tests/.auth/${spec.name}.json`), { force: true });
      try {
        const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
        for (const spec of targets) delete state.users?.[spec.name];
        fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
      } catch {}
    }
    return;
  }

  if (DRY) {
    for (const spec of targets) console.log(`  ${spec.name}: ${(await ownedTestUser(spec.name)) ? "güncellenecek" : "açılacak"}`);
    return;
  }

  const secrets = loadSecrets();
  const state = { seededAt: new Date().toISOString(), domain: E2E_DOMAIN, users: {} };
  const now = new Date();
  for (const spec of targets) {
    const id = await upsertAccount(spec, secrets);
    saveSecrets(secrets); // parola her hesaptan sonra yazılır: yarıda kalırsa bir sonraki koşu aynı parolayı kullanır
    await seedProfile(id, spec);
    await silenceMail(id);
    await seedPlan(id, spec, now);
    await seedMeters(id, spec, now);
    const prepId = await seedPrep(id, spec, now);
    const documentId = spec.document ? await seedDocument(id) : undefined;
    const { data: pathRows } = await service.from("exam_prep_nodes").select("id, kind").eq("exam_prep_id", prepId).order("sort_order");
    const lessonNodeId = pathRows?.find((n) => n.kind === "lesson")?.id ?? null;
    const quizNodeId = pathRows?.find((n) => n.kind === "quiz")?.id ?? null;
    state.users[spec.name] = { plan: spec.plan, prepId, lessonNodeId, quizNodeId, ...(documentId ? { documentId } : {}) };
    console.log(`  ${spec.name}: hazır (${spec.plan})`);
  }
  let previous = {};
  try {
    previous = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")).users ?? {};
  } catch {}
  fs.writeFileSync(STATE_FILE, `${JSON.stringify({ ...state, users: { ...previous, ...state.users } }, null, 2)}\n`);
  console.log(`Parolalar: tests/.auth/e2e-users.local.json (gitignore). Durum: tests/.auth/e2e-state.json.`);
}

main().catch((error) => die(`Durdu: ${error.message}`));
