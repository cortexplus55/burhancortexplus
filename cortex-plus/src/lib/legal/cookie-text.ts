import { COOKIE_POLICY_VERSION } from "@/lib/legal/versions";
import type { LegalSection } from "@/lib/legal/legal-types";

/**
 * Çerez Politikası — KVKK Kurumu'nun Çerez Uygulamaları Hakkında Rehberi'ne (2022, güncel taslak 2025) göre.
 * Rehberin istediği: her çerezin adı, amacı, süresi ve birinci/üçüncü taraf olduğu; zorunlu çerezler izinsiz,
 * diğerleri yalnız açık rızayla; "Reddet" "Kabul et" kadar görünür; rıza kolayca geri alınabilir; tercih
 * makul süre sonra yeniden sorulur.
 *
 * Tablo kodun gerçekte yazdığı çerezlerden çıkarıldı (6-7 Kasım 2026). Yeni bir çerez ya da analitik araç
 * eklenirse önce bu tablo ve `COOKIE_POLICY_VERSION` değişir; sürüm değişince tercih herkese yeniden sorulur.
 */

export type CookieCategory = "zorunlu" | "analitik";

export type CookieRow = {
  name: string;
  category: CookieCategory;
  purpose: string;
  duration: string;
  party: string;
  kind: string;
};

export const COOKIE_ROWS: CookieRow[] = [
  {
    name: "sb-…-auth-token, sb-…-code-verifier",
    category: "zorunlu",
    purpose: "Giriş yaptığında oturumunu açık tutar; Google ile girişte güvenlik adımını tamamlar.",
    duration: "Oturum yenilendikçe uzar, en çok 400 gün; çıkış yapınca silinir",
    party: "Birinci taraf (oturum altyapısı Supabase)",
    kind: "Çerez",
  },
  {
    name: "cp_device",
    category: "zorunlu",
    purpose: "Hesabın en çok iki cihazda açık kalmasını denetler.",
    duration: "30 gün",
    party: "Birinci taraf",
    kind: "Çerez",
  },
  {
    name: "cp_focus_prep",
    category: "zorunlu",
    purpose: "En son çalıştığın sınav hazırlığını hatırlar.",
    duration: "60 gün",
    party: "Birinci taraf",
    kind: "Çerez",
  },
  {
    name: "cp_consent",
    category: "zorunlu",
    purpose: "Çerez tercihini hatırlar; tekrar sormamak için.",
    duration: "12 ay",
    party: "Birinci taraf",
    kind: "Çerez",
  },
  {
    name: "cp_admin_gate",
    category: "zorunlu",
    purpose: "Yalnız yönetim panelinde ikinci doğrulama adımını hatırlar.",
    duration: "12 saat",
    party: "Birinci taraf",
    kind: "Çerez",
  },
  {
    name: "Tema, taslak ve ekran tercihleri",
    category: "zorunlu",
    purpose:
      "Açık/koyu tema seçimin, yarım kalan test ve deneme cevapların, kurulum taslağın ve kapattığın uyarılar. Sayfa yenilenince işin kaybolmasın diye cihazında tutulur; bize gönderilmez.",
    duration: "İş bitince ya da sen silene kadar",
    party: "Birinci taraf",
    kind: "Tarayıcı depolaması",
  },
  {
    name: "PayTR ödeme sayfası",
    category: "zorunlu",
    purpose: "Ödeme sayfası PayTR'nin kendi alan adında açılır; güvenli ödeme için PayTR'nin çerezleri çalışır.",
    duration: "PayTR belirler",
    party: "Üçüncü taraf (PayTR)",
    kind: "Çerez",
  },
  {
    name: "ph_…_posthog",
    category: "analitik",
    purpose:
      "Hangi sayfaların açıldığını ve hangi özelliklerin kullanıldığını ölçer (rastgele bir ziyaretçi kimliğiyle). Tıklamaların, yazdıkların ve ekran kaydı toplanmaz.",
    duration: "12 ay",
    party: "Üçüncü taraf (PostHog, Avrupa Birliği sunucuları)",
    kind: "Çerez ve tarayıcı depolaması",
  },
];

export const COOKIE_CATEGORY_LABELS: Record<CookieCategory, { title: string; body: string }> = {
  zorunlu: {
    title: "Zorunlu",
    body: "Giriş, güvenlik ve tercihlerin için gerekir; kapatılamaz. Bunlar için izin istemeyiz.",
  },
  analitik: {
    title: "Analitik",
    body: "Hangi sayfaların açıldığını ölçer, siteyi geliştirmemize yardım eder. Yalnız izin verirsen çalışır.",
  },
};

export const COOKIE_SECTIONS: LegalSection[] = [
  {
    heading: "Çerez nedir",
    body: [
      "Çerez, bir sitenin tarayıcına kaydettiği küçük bir metin dosyasıdır. Benzer işi tarayıcı depolaması da görür. Bu politika ikisini birlikte anlatır ve aşağıdaki tabloda tek tek listeler.",
    ],
  },
  {
    heading: "Zorunlu çerezler",
    body: [
      "Sitenin çalışması ve senin istediğin hizmetin sunulması için gereklidir: oturumunun açık kalması, hesabının güvenliği ve çerez tercihinin hatırlanması gibi. Bunlar için izin istemeyiz (KVKK m.5/2-c ve f). Tarayıcından engellersen giriş ve bazı özellikler çalışmaz.",
    ],
  },
  {
    heading: "Analitik çerezler",
    body: [
      "Yalnız izin verirsen çalışır (KVKK m.5/1, açık rıza). Hangi sayfaların açıldığını ve hangi özelliklerin kullanıldığını ölçmemize yardım eder. Tıklamaların, yazdıkların ve ekran kaydı toplanmaz; adreslerdeki kodlar ve kimlikler gönderilmeden silinir. Hizmet, Avrupa Birliği sunucularında çalışan PostHog'dur.",
      "İzin vermezsen site tamamen çalışır; yalnız ölçüm yapılmaz.",
    ],
  },
  {
    heading: "Reklam ve pazarlama çerezleri",
    body: ["Kullanmıyoruz. Verilerin reklam ağlarıyla paylaşılmaz."],
  },
  {
    heading: "Tercihini nasıl değiştirirsin",
    body: [
      "Sayfanın altındaki \"Çerez tercihleri\" bağlantısından ya da Ayarlar'dan istediğin zaman değiştirebilirsin. İzni geri alırsan ölçüm durur ve analitik çerezler tarayıcından silinir.",
      "Tarayıcının ayarlarından da çerezleri silebilir ya da engelleyebilirsin.",
    ],
  },
  {
    heading: "Tercihin ne kadar saklanır",
    body: [
      "12 ay. Süre dolunca ya da bu politika değişince yeniden sorarız.",
      "Giriş yaptıysan tercihin hesabına da kaydedilir; başka bir cihazda giriş yaptığında yeniden sorulmaz. Tercih kaydında IP adresin yalnız tek yönlü özet olarak tutulur.",
      `Bu politikanın sürümü: ${COOKIE_POLICY_VERSION}.`,
    ],
  },
];
