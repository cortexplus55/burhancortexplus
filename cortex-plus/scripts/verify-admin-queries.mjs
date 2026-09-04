/**
 * Yönetim panelinin bütün sorgularını sınar.
 *
 * Kullanım:
 *   node --env-file=.env.local scripts/verify-admin-queries.mjs
 *
 * Neden var: PostgREST, iki tablo arasında birden çok bağlantı bulunca hangi
 * sütunu kullanacağını seçemiyor ve sorgunun tamamını boş döndürüyor. Hata
 * fırlatmıyor, sayfa da boş görünüyor — "henüz kayıt yok" yazısı gerçek
 * sanılıyor. Kullanıcılar ve ödemeler sayfaları uzun süre bu yüzden boştu.
 *
 * Bu betik her sorguyu çalıştırıp satır sayısını ve varsa hatayı yazıyor.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SECRET_KEY gerekli.");
  process.exit(1);
}

const s = createClient(url, key, { auth: { persistSession: false } });

const checks = [
  {
    page: "Özet · kullanıcı sayısı",
    run: () => s.from("profiles").select("id", { count: "exact", head: true }),
  },
  {
    page: "Özet · son ödemeler",
    run: () =>
      s
        .from("payments")
        .select("id, amount_try, status, created_at, profiles!payments_user_id_fkey(full_name)")
        .limit(5),
  },
  {
    page: "Kullanıcılar",
    run: () =>
      s
        .from("profiles")
        .select(
          "id, full_name, grade_level, created_at, credit_wallets(balance), user_roles!user_roles_user_id_fkey(role, revoked_at)",
        )
        .limit(50),
  },
  {
    page: "Öğretmen başvuruları",
    run: () =>
      s
        .from("teacher_applications")
        .select("id, institution, status, created_at, notes, profiles!teacher_applications_user_id_fkey(full_name)")
        .limit(50),
  },
  {
    page: "Ödemeler",
    run: () =>
      s
        .from("payments")
        .select("id, merchant_oid, amount_try, status, created_at, profiles!payments_user_id_fkey(full_name)")
        .limit(50),
  },
  {
    page: "Ödemeler · bildirimler",
    run: () => s.from("payment_webhook_events").select("merchant_oid, status, created_at").limit(20),
  },
  {
    page: "Paketler",
    run: () =>
      s
        .from("plans")
        .select("id, slug, name, description, price_try, credit_amount, is_premium, active, sort_order")
        .limit(50),
  },
  {
    page: "Kampanya kodları",
    run: () =>
      s
        .from("promo_codes")
        .select("id, code, credit_amount, max_redemptions, redemption_count, active, expires_at, created_at")
        .limit(100),
  },
  {
    page: "Kredi bedelleri",
    run: () =>
      s.from("credit_rules").select("action_code, credit_cost, model_tier, description, active"),
  },
  {
    page: "AI kullanımı",
    run: () => s.from("ai_usage_events").select("action_code, model, tokens_in, tokens_out").limit(500),
  },
  {
    page: "Giderler · model fiyatları",
    run: () => s.from("ai_model_prices").select("model, input_per_1k, output_per_1k"),
  },
  {
    page: "AI talimatları",
    run: () => s.from("prompt_versions").select("id, key, version, content, active, created_at").limit(50),
  },
  {
    page: "Özellik anahtarları",
    run: () => s.from("feature_flags").select("key, enabled, description"),
  },
  {
    page: "İşlem geçmişi",
    run: () =>
      s
        .from("audit_logs")
        .select("id, action, entity_type, entity_id, created_at, profiles!audit_logs_actor_id_fkey(full_name)")
        .limit(100),
  },
];

let failed = 0;

for (const check of checks) {
  const { data, error, count } = await check.run();
  const rows = count ?? data?.length ?? 0;
  if (error) {
    failed += 1;
    console.log(`✗ ${check.page}`);
    console.log(`    ${error.message}`);
    if (error.hint) console.log(`    ipucu: ${error.hint}`);
  } else {
    console.log(`✓ ${check.page.padEnd(30)} ${rows} satır`);
  }
}

console.log("");
if (failed) {
  console.log(`${failed} sorgu başarısız.`);
  process.exit(1);
}
console.log("Bütün yönetim sorguları çalışıyor.");
