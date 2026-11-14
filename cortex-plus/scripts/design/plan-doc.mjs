#!/usr/bin/env node
/**
 * 03-plan-okuyan-yerler.md üreticisi (Faz 0). plan-scan.mjs çıktısını özetler; Faz 3'ün girdisi olan karar noktaları
 * elle seçilmiştir (dosya:satır, 14 Kasım 2026'da main 492e206e üzerinde doğrulandı).
 *
 *   node scripts/design/plan-scan.mjs --out docs/design-migration/data
 *   node scripts/design/plan-doc.mjs
 */
import fs from "node:fs";

const DATA = "docs/design-migration/data/plan-okuyan-yerler.json";
const CSV = "docs/design-migration/data/plan-okuyan-yerler.csv";
const OUT = "docs/design-migration/03-plan-okuyan-yerler.md";
const { summary, rows } = JSON.parse(fs.readFileSync(DATA, "utf8"));

// [dosya:satır, karar türü, plana göre davranış, not]
const DECISIONS = [
  ["— Kaynak (planın kendisi) —"],
  ["src/lib/billing/entitlements.ts:238", "mantık", "hepsi", "`getUserEntitlements`: abonelik satırından isPremium, planSlug, tier (plus/sigma), dönem, showsUpgradeChrome. Planın tek kaynağı."],
  ["src/lib/billing/entitlements.ts:168", "mantık", "Plus, Sigma, Sınav Haftası", "`entitlementsFromSubscriptionRow`: satırı plana çevirir (deneme, haftalık)."],
  ["src/lib/student/account-context.ts:74", "mantık", "hepsi + Kurucu", "`getStudentAccountContext`: kabuğun `account`'u (isAdmin, isPremium, subscriptionBadge, planSlug, showsUpgradeChrome = !isAdmin && …:132)."],
  ["src/lib/billing/free-preview.ts:63", "mantık", "Kurucu", "`billingExempt`: kurucu hak düşmez; önizlemede ücretsiz gibi."],
  ["src/lib/auth/admin-role.ts:41", "mantık", "Kurucu", "`is_founder` RPC; kurucu kimliği `user_roles`'tan."],
  ["— API zorlaması (sunucu, 402) —"],
  ["supabase/migrations/20261111180000_free_lesson_trial.sql:39", "API zorlaması (SQL)", "Ücretsiz", "`credit_reserve_metered`: ücretsiz sayaçlar (ders 0, mesaj 3, fotoğraf 1, derse dahil 40); dolunca ret."],
  ["supabase/migrations/20261027193000_sketch_video_credits.sql:12", "API zorlaması (SQL)", "Ücretsiz", "`plus_only_action`: podcast, sözlü, yazılı deneme, video, çizimli video, sesli tur, ses ücretsizde açılmaz."],
  ["src/lib/credits/service.ts:118", "API zorlaması", "hepsi", "`reserveCredits`: harcama sigortası, `freeLessonGate`, SQL ayırma; ret kodları (`refusalCode`:46)."],
  ["src/lib/billing/free-lesson-gate.ts:42", "API zorlaması", "Ücretsiz", "`freeLessonGate`: ders sayacına düşen iş ücretsizde Plus'a (`free_lesson_limit`)."],
  ["src/lib/billing/free-topic-gate.ts:84", "API zorlaması", "Ücretsiz", "`freeTopicGate`: ilk hazırlığın 1. konusu dışındaki adımlar (`free_topic_limit`)."],
  ["src/lib/billing/node-free-meter.ts:16", "API zorlaması + yol", "Ücretsiz", "`pathSkipKinds`: ücretsizde Plus adımları (podcast, sözlü, yazılı deneme) yolda sayılmaz."],
  ["src/lib/billing/node-free-meter.ts:33", "görünüm kapısı", "Ücretsiz", "`plusOnlyLocked`: sınav sabahı kâğıdı ücretsizde kilitli."],
  ["src/lib/billing/node-free-meter.ts:58", "limit", "Ücretsiz", "`nodeMeterFor`: yol adımının sayacı (lesson / included / plus)."],
  ["src/lib/billing/free-prep-limit.ts:21", "API zorlaması", "Ücretsiz", "`freePrepLimitReached`: ücretsizde tek hazırlık (402: `create/route.ts:213`, `invite/join/route.ts:46`)."],
  ["src/lib/billing/spend-breaker.ts:103", "API zorlaması", "Ücretsiz", "`spendBreakerBlocks`: günlük OpenAI tavanında ücretsiz iş durur (`spend_cap_free`)."],
  ["src/lib/learning/fast-access.ts:15", "mantık", "Plus, Sigma, Kurucu", "`fastAllowedFor`: hızlı işlem yalnız ücretli ve kurucuda."],
  ["src/lib/learning/node/start.ts:79", "API zorlaması", "Ücretsiz", "Yol adımı açılışında 402."],
  ["src/app/api/documents/process/route.ts:336", "API zorlaması", "Ücretsiz", "Belge işleme: sayfa ve fotoğraf hakkı 402 (ayrıca :350, :596, :604; `preflight/route.ts:58`)."],
  ["src/app/api/learning/exam-prep/duel/route.ts:62", "API zorlaması", "Ücretsiz", "Düello kurma ders sayacına düşer → ücretsizde Plus."],
  ["src/app/api/school/route.ts:107", "API zorlaması", "Ücretsiz", "Okul ağı 402."],
  ["— Sabit listeler (plan → iş) —"],
  ["src/lib/billing/free-meters.ts:25", "limit", "Ücretsiz", "`FREE_LIMITS = { lesson: 0, chat: 3, photo: 1, included: 40 }`."],
  ["src/lib/billing/free-meters.ts:30", "limit", "Ücretsiz", "`PLUS_ONLY_ACTIONS` (SQL `plus_only_action` ile aynı)."],
  ["src/lib/billing/free-meters.ts:45", "limit", "Ücretsiz", "`PLUS_ONLY_NODE_KINDS`: podcast, oral, written_exam."],
  ["src/lib/billing/free-tier-copy.ts:28", "görünüm (metin)", "Ücretsiz", "`PLUS_ONLY_FEATURES`: ücretsizde kapalı işlerin adları."],
  ["src/lib/credits/price-table.ts:97", "limit", "Plus, Sınav Haftası, Sigma", "`PLAN_ALLOWANCES`: haftalık 2.700, aylık 7.200, Sigma 60.000 kredi."],
  ["src/lib/billing/plan-value.ts:28", "görünüm", "Ücretsiz/Plus", "`PLAN_WORK[].plusOnly`: Plus'ın bir ayı tablosu."],
  ["src/lib/parity/studios.ts:27", "görünüm", "Ücretsiz", "`STUDIOS`: Stüdyo kartlarında Plus rozeti."],
  ["— Görünüm (plan adını ya da kilidi doğrudan çizen) —"],
  ["src/lib/student/plan-identity.ts:34", "görünüm", "hepsi + Kurucu", "`planIdentity`: kapsül, panel, alt çubuk halkası (Faz 2)."],
  ["src/components/parity/sor-shell.tsx:156", "görünüm + yönlendirme", "Ücretsiz", "`showBuy`: üst çubukta \"Plus'a geç\" (`/pay`)."],
  ["src/components/parity/profile-identity.tsx:203", "görünüm + yönlendirme", "hepsi + Kurucu", "Profil kartının plan şeridi (Plus'a geç / Ek paket / Kurucu çipi)."],
  ["src/lib/billing/tier-presentation.ts:247", "görünüm", "Ücretsiz/Plus/Sigma", "`profilePlanView`: plan satırı metni."],
  ["src/app/krediler/page.tsx:116", "görünüm", "hepsi + Kurucu", "Kullanım limitleri: kurucu / ücretli kota / ücretsiz sayaçlar."],
  ["src/app/pay/page.tsx:37", "görünüm", "Kurucu", "Abonelik: kurucuya \"Bütün özellikler açık\" kartı (satış yok)."],
  ["src/app/ayarlar/page.tsx:105", "görünüm", "hepsi + Kurucu", "Ayarlar hesap kartındaki plan etiketi / Kurucu rozeti."],
  ["src/components/paywall/credit-gate.tsx:16", "görünüm + yönlendirme", "Ücretsiz", "`CreditGate`: ret koduna göre kapı (Plus'ta açık / hak doldu)."],
  ["src/components/paywall/upgrade-sheet.tsx:43", "görünüm + yönlendirme", "Ücretsiz", "`UpgradeSheet`: yükseltme yan paneli."],
  ["src/components/parity/plus-only-gate.tsx:13", "görünüm", "Ücretsiz", "`PlusOnlyGate`: sınav sabahı kâğıdı kilidi."],
  ["src/components/parity/first-topic-lock.tsx:12", "görünüm", "Ücretsiz", "1. konu dışında kilit kartı ve sayfası."],
  ["src/components/parity/home-cockpit.tsx:473", "görünüm", "Ücretsiz", "`HomeToolsTray`: araç tepsisinde \"Plus\" rozeti (:520)."],
  ["src/components/chat/chat-panel.tsx:357", "görünüm", "Ücretsiz/Plus", "`gatePremium`: sohbetteki hak kapısı metni (:166, :173)."],
  ["src/components/parity/exam-node/gates.ts:71", "görünüm", "Ücretsiz", "Yol adımında `premium_required` kapısı."],
  ["src/lib/billing/free-reach.ts:86", "görünüm", "Ücretsiz", "Araç seçicide Plus rozeti / kapı."],
  ["src/lib/camp/offer.ts:9", "görünüm", "Ücretsiz", "Sınav Haftası (kamp) teklifi yalnız ücretsizde."],
  ["src/lib/payments/paytr-capability.ts:34", "mantık", "Plus, Sigma", "`AUTO_RENEW_SUPPORTED = false`."],
];

const by = (key, list) => list.reduce((acc, r) => ((acc[r[key]] = (acc[r[key]] ?? 0) + 1), acc), {});
const decisive = rows.filter((r) => !["yorum", "sorgu/hız sınırı (plan değil)", "ilgisiz (günlük hedef, e-posta)"].includes(r.kind));
const kinds = Object.entries(summary.byKind).sort((a, b) => b[1] - a[1]);
const filesDecisive = Object.entries(by("file", decisive)).sort((a, b) => b[1] - a[1]);

let md = `# 03 · Plan okuyan yerler

Faz 3'ün (\`getGate\` / \`useGate\` / \`<Gate>\`) ana girdisi. Prompt 1 §2.3'teki desenler \`src/\` altında tarandı (fikstür \`src/app/e2e\` ve testler hariç).

Üretim: \`node scripts/design/plan-scan.mjs --out docs/design-migration/data\` + \`node scripts/design/plan-doc.mjs\`.
**Tam liste (her eşleşen satır, dosya:satır, tür, plan): \`${CSV}\`** (${summary.rows} satır, ${summary.files} dosya).

## Desenler
\`plan ===\`, \`plan ==\`, \`isPlus\`, \`isSigma\`, \`isFounder\`, \`isPremium\`, \`subscription\`, \`tier\`, \`🔒\`, \`PLUS\`, \`FREE_LIMITS\`, \`daily\`, \`monthly\`, \`"/pay\`, \`402\`, \`limit\`, \`quota\`, \`remaining\` (büyük/küçük harf duyarsız).

## Sınıflama (sezgisel; satır metnine göre)
| Tür | Satır |
|---|---|
${kinds.map(([k, n]) => `| ${k} | ${n} |`).join("\n")}

- **API zorlaması**: \`src/app/api/**\` ya da satırda 402 / ret kodu (\`free_*_limit\`, \`premium_required\`, \`spend_cap\`).
- **yönlendirme**: \`"/pay\` ya da \`redirect(\`. **limit**: limit/quota/remaining/meter/daily/monthly. **görünüm**: kalan \`.tsx\`. **mantık**: kalan \`.ts\`.
- Plan sütunu satırdaki adlardan: \`isAdmin/founder\` → Kurucu, \`sigma\` → Sigma, \`haftalik/week\` → Sınav Haftası, \`isPremium/plus/subscription\` → Plus/ücretli, \`free/ücretsiz/showsUpgradeChrome\` → Ücretsiz; hiçbiri yoksa "belirsiz".
- **Sınır**: \`limit\` ve \`subscription\` gibi desenler çok genel; "sorgu/hız sınırı" ve "yorum" satırları plan kararı değil, tabloda yine duruyor. Sezgi bir satırı yanlış türe koyabilir; Faz 3 karar noktalarına aşağıdaki elle seçilmiş tablodan bakmalı.

## Karar noktaları (elle seçildi, Faz 3 bunları \`getGate\`'e taşıyacak)
| Dosya:satır | Tür | Plan | Ne yapıyor |
|---|---|---|---|
${DECISIONS.map((d) => (d.length === 1 ? `| **${d[0]}** | | | |` : `| \`${d[0]}\` | ${d[1]} | ${d[2]} | ${d[3]} |`)).join("\n")}

## Plan kararı taşıyan dosyalar (yorum ve sorgu sınırı hariç, en çok 40)
| Dosya | Satır |
|---|---|
${filesDecisive.slice(0, 40).map(([f, n]) => `| \`${f}\` | ${n} |`).join("\n")}

Toplam ${decisive.length} karar satırı, ${filesDecisive.length} dosya.
`;
fs.writeFileSync(OUT, md);
// JSON'un satırları CSV'de; depoda yalnız özet kalsın.
fs.writeFileSync(DATA, JSON.stringify({ summary }, null, 1));
console.log(`yazıldı: ${OUT}; karar satırı ${decisive.length}, dosya ${filesDecisive.length}`);
