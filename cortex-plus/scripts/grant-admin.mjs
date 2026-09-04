/**
 * Bir hesaba yönetici yetkisi verir (ya da geri alır).
 *
 * Kullanım:
 *   node --env-file=.env.local scripts/grant-admin.mjs ornek@site.com
 *   node --env-file=.env.local scripts/grant-admin.mjs ornek@site.com --revoke
 *
 * Neden betik: ilk yöneticiyi panelden vermek mümkün değil — paneli açmak
 * için zaten yönetici olmak gerekiyor. Bu yumurta-tavuk döngüsünü kırmanın
 * tek yolu doğrudan veritabanına yazmak.
 *
 * `SUPABASE_SECRET_KEY` bütün satır güvenliğini atlar; bu betik yalnızca
 * `user_roles` tablosuna dokunur ve ne yaptığını satır satır yazar.
 */
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
const revoke = process.argv.includes("--revoke");

if (!email) {
  console.error("Kullanım: node --env-file=.env.local scripts/grant-admin.mjs <e-posta> [--revoke]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SECRET_KEY gerekli.");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Auth kullanıcısını e-postadan bul. Liste sayfalı geliyor, hepsini tarıyoruz. */
async function findUserByEmail(target) {
  const needle = target.trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Kullanıcı listesi alınamadı: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === needle);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

const user = await findUserByEmail(email);
if (!user) {
  console.error(`✗ Bu e-postayla kayıtlı hesap yok: ${email}`);
  process.exit(1);
}

console.log(`Hesap bulundu: ${user.email}`);
console.log(`  id      : ${user.id}`);
console.log(`  kayıt   : ${user.created_at}`);

// Profil satırı olmadan `user_roles` yabancı anahtarı tutmaz.
const { data: profile } = await admin
  .from("profiles")
  .select("id, full_name")
  .eq("id", user.id)
  .maybeSingle();

if (!profile) {
  console.error("✗ Bu hesabın profil kaydı yok; önce uygulamaya bir kez giriş yapılmalı.");
  process.exit(1);
}
console.log(`  profil  : ${profile.full_name || "(isimsiz)"}`);

if (revoke) {
  const { error } = await admin
    .from("user_roles")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("role", "admin")
    .is("revoked_at", null);
  if (error) {
    console.error(`✗ Yetki geri alınamadı: ${error.message}`);
    process.exit(1);
  }
  console.log("✓ Yönetici yetkisi geri alındı.");
  process.exit(0);
}

// UNIQUE (user_id, role) var: daha önce verilip geri alınmışsa satır duruyor,
// yenisini eklemek yerine `revoked_at` temizleniyor.
const { data: existing } = await admin
  .from("user_roles")
  .select("id, revoked_at")
  .eq("user_id", user.id)
  .eq("role", "admin")
  .maybeSingle();

if (existing && !existing.revoked_at) {
  console.log("• Bu hesap zaten yönetici, değişiklik yapılmadı.");
  process.exit(0);
}

const { error } = existing
  ? await admin.from("user_roles").update({ revoked_at: null }).eq("id", existing.id)
  : await admin.from("user_roles").insert({ user_id: user.id, role: "admin" });

if (error) {
  console.error(`✗ Yetki verilemedi: ${error.message}`);
  process.exit(1);
}

console.log("✓ Yönetici yetkisi verildi. cortexplus.app/admin artık açık.");
