// Hatırlatma cron'unun KURU çalıştırması — hiçbir şey göndermez, yazmaz.
// Çalıştırma: node --env-file=.env.local scripts/probe-study-reminders.mjs
//
// Cron günde bir kez çalışıyor ve öğrenci başına en fazla bir bildirim
// bırakıyor. İlk çalışmasından önce kime ne gideceğini görmek gerekiyordu:
// gönderim bir kez başlayınca geri alınamıyor.
//
// Karar `pickReminder` ile veriliyor — cron'un kullandığı fonksiyonun
// kendisi, kopyası değil. Sorgular cron'un sorgularını yansıtıyor.
import { createServer } from "vite";
import { createClient } from "@supabase/supabase-js";

const server = await createServer({
  configFile: "vitest.config.ts",
  server: { middlewareMode: true },
});
try {
  if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname !== "dgjfyewgrukglsehyntc.supabase.co") {
    throw new Error("wrong_project");
  }
  const { pickReminder, moreUrgent } = await server.ssrLoadModule(
    "/src/lib/learning/study-reminder.ts",
  );
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });

  const isoDay = (d) => d.toISOString().slice(0, 10);
  const now = new Date();
  const today = isoDay(now);
  const yesterday = isoDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  const { data: preps } = await db
    .from("exam_preps")
    .select("id, user_id, title, exam_date")
    .gte("exam_date", today)
    .limit(2000);
  console.log(`Sınavı geçmemiş hazırlık: ${preps?.length ?? 0}`);
  if (!preps?.length) {
    console.log("Gönderilecek bir şey yok.");
    process.exit(0);
  }

  const userIds = [...new Set(preps.map((p) => p.user_id))];
  const [{ data: nodes }, { data: attempts }, { data: streaks }, { data: sentToday }] =
    await Promise.all([
      db.from("exam_prep_nodes").select("exam_prep_id, status").in("exam_prep_id", preps.map((p) => p.id)),
      db.from("exam_prep_node_attempts").select("user_id, updated_at").in("user_id", userIds)
        .order("updated_at", { ascending: false }).limit(5000),
      db.from("user_streaks").select("user_id, current_streak, last_activity_date").in("user_id", userIds),
      db.from("notifications").select("user_id, created_at").in("user_id", userIds)
        .gte("created_at", `${today}T00:00:00Z`),
    ]);

  const unfinishedByPrep = new Set(
    (nodes ?? []).filter((n) => n.status !== "done").map((n) => n.exam_prep_id),
  );
  const lastActivity = new Map();
  for (const a of attempts ?? []) if (!lastActivity.has(a.user_id)) lastActivity.set(a.user_id, a.updated_at);
  const streakByUser = new Map((streaks ?? []).map((r) => [r.user_id, r]));
  const notifiedToday = new Set((sentToday ?? []).map((r) => r.user_id));

  // "shiftHours" ileri saat: yarın bu saatte ne olacağını görmek için.
  // Cron'un kendisi böyle bir şey yapmıyor; bu yalnızca kuralın
  // tetiklendiğini göndermeden önce görebilmek için.
  const run = (shiftHours = 0) => {
    const clock = new Date(now.getTime() + shiftHours * 3_600_000);
    const day = isoDay(clock);
    const prevDay = isoDay(new Date(clock.getTime() - 86_400_000));
    const best = new Map();
    const skipped = { finished: 0, alreadyUser: 0, noReminder: 0 };
    const why = [];

    for (const prep of preps) {
      const userId = prep.user_id;
      if (!unfinishedByPrep.has(prep.id)) { skipped.finished += 1; continue; }

      const last = lastActivity.get(userId);
      const hoursSinceActivity = last ? (clock.getTime() - Date.parse(last)) / 3_600_000 : null;
      const daysUntilExam = prep.exam_date
        ? Math.round((Date.parse(`${prep.exam_date}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000)
        : null;
      const streak = streakByUser.get(userId);
      const input = {
        hasUnfinishedPath: true,
        hoursSinceActivity,
        daysUntilExam,
        streakDays: streak?.current_streak ?? 0,
        streakBreaksToday: streak?.last_activity_date === prevDay,
        alreadyNotifiedToday: shiftHours === 0 && notifiedToday.has(userId),
      };
      const reminder = pickReminder(input);
      if (!reminder) {
        skipped.noReminder += 1;
        if (why.length < 3) {
          why.push(
            `    ${prep.title?.slice(0, 30)} — son etkinlik ${
              hoursSinceActivity == null ? "yok" : Math.round(hoursSinceActivity) + "s önce"
            }, sınava ${daysUntilExam} gün, seri ${input.streakDays}${
              input.streakBreaksToday ? " (bugün kırılıyor)" : ""
            }${input.alreadyNotifiedToday ? ", bugün zaten bildirildi" : ""}`,
          );
        }
        continue;
      }

      const candidate = {
        userId,
        reminder,
        kind: reminder.kind,
        title: reminder.title,
        body: `${prep.title ?? "Sınav hazırlığın"} — ${reminder.body}`,
        hoursSinceActivity: hoursSinceActivity == null ? "hiç çalışmamış" : Math.round(hoursSinceActivity),
        daysUntilExam,
      };
      const current = best.get(userId);
      // Öğrenci başına en acil hazırlık konuşur — cron'un kuralı.
      if (!current) best.set(userId, candidate);
      else if (moreUrgent(candidate, current) < 0) {
        best.set(userId, candidate);
        skipped.alreadyUser += 1;
      } else skipped.alreadyUser += 1;
    }
    return { rows: [...best.values()], skipped, why };
  };

  const { rows, skipped, why } = run(0);
  console.log(`Atlanan — yolu bitmiş: ${skipped.finished}, aynı kullanıcı tekrar: ${skipped.alreadyUser}, kural uymadı: ${skipped.noReminder}`);
  if (why.length) {
    console.log("  Kural neden uymadı (ilk 3):");
    for (const line of why) console.log(line);
  }
  console.log(`\nUYGULAMA İÇİ BİLDİRİM GİDECEK: ${rows.length} kişi`);

  const mask = (e) => (e ? e.slice(0, 2) + "***@" + e.split("@")[1] : "(e-posta yok)");
  let wouldMail = 0;
  for (const row of rows) {
    const { data: prof } = await db.from("profiles").select("study_reminder_email").eq("id", row.userId).maybeSingle();
    const { data: account } = await db.auth.admin.getUserById(row.userId);
    const optedIn = prof?.study_reminder_email === true;
    const to = account?.user?.email;
    if (optedIn && to) wouldMail += 1;
    console.log(`\n  ${mask(to)}  ${optedIn && to ? "→ E-POSTA GİDER" : "→ yalnızca uygulama içi"}`);
    console.log(`    kural: ${row.kind} · son etkinlik: ${row.hoursSinceActivity} saat önce · sınava ${row.daysUntilExam} gün`);
    console.log(`    başlık: ${row.title}`);
    console.log(`    metin:  ${row.body}`);
  }
  console.log(`\nE-POSTA GİDECEK: ${wouldMail} kişi. (Bu betik hiçbir şey göndermedi.)`);

  // Kuralın hiç tetiklenmediğini değil, BUGÜN tetiklenmediğini görmek için:
  // aynı veriyle saati ileri alıp bir gün sonrasını çalıştırıyoruz.
  console.log("\n────────────────────────────────────────");
  console.log("YARIN AYNI SAATTE (öğrenci bir daha girmezse):");
  const tomorrow = run(24);
  console.log(`  bildirim: ${tomorrow.rows.length} kişi`);
  for (const row of tomorrow.rows.slice(0, 5)) {
    console.log(`    [${row.kind}] ${row.title}`);
    console.log(`             ${row.body}`);
  }
  if (!tomorrow.rows.length && tomorrow.why.length) {
    console.log("  yine tetiklenmedi:");
    for (const line of tomorrow.why) console.log(line);
  }
} finally {
  await server.close();
}
