import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
  Mağaza uyumluluğu (26 Kasım 2026): App Store 3.1.1 / 3.1.2 / 5.1.1(v), Google Play ödeme, hesap silme ve yapay zekâ
  içerik politikası. Bu dosya kuralların kodda durduğunu tutar:
  - uygulamada (tarayıcı kimliğinde CortexPlusApp) web ödemesi yok: sayfa yönlenir, uç reddeder, `/pay` mağaza ekranı,
  - mağaza abonelik ekranında zorunlu cümleler ve bağlantılar,
  - kalıcı hesap silme ve giriş yapmadan silme (imzalı bağlantı),
  - öğretmen yanıtını "Bildir", yapay zekâ notu, hukuki metinlerin içeriği.
*/

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0 Mobile Safari/537.36 CortexPlusApp/1 (android)";
const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 CortexPlusApp/1 (ios)";
const WEB_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const mw = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: mw.user } }), signOut: async () => undefined },
    rpc: async () => ({ data: true, error: null }),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { primary_role: "student", onboarding_completed_at: "2026-11-01" }, error: null }) }) }),
    }),
  }),
}));

const read = (path: string) => readFileSync(path, "utf8");

describe("uygulamada web ödemesi yok: karar tablosu", async () => {
  const { nativePaymentDecision, nativeGuestHomeRedirect, NATIVE_BLOCKED_APIS } = await import(
    "@/lib/platform/native-payment-policy"
  );

  it("tarayıcıda hiçbir şey değişmez", () => {
    for (const path of ["/pay", "/fiyatlandirma", "/veli-odeme/x", "/odeme/basarili", "/api/payments/paytr/create-token", "/ozellikler", "/"]) {
      expect(nativePaymentDecision(path, WEB_UA)).toBeNull();
      expect(nativePaymentDecision(path, null)).toBeNull();
    }
    expect(nativeGuestHomeRedirect("/", WEB_UA, false)).toBeNull();
  });

  it("uygulamada ödeme başlatan ve ücretsiz Plus açan uçlar reddedilir", () => {
    for (const path of [
      "/api/payments/paytr/create-token",
      "/api/payments/parent-link",
      "/api/payments/parent-link/checkout",
      "/api/billing/parent-link",
      "/api/billing/parent-link/status",
      "/api/promo/redeem",
    ]) {
      expect(nativePaymentDecision(path, ANDROID_UA)).toEqual({ kind: "block", status: 403, error: "native_store_only" });
      expect(nativePaymentDecision(path, IOS_UA)?.kind).toBe("block");
    }
    // Okuyan uçlar açık: plan durumu ve web aboneliğinin yönetimi (çok platformlu hizmet).
    for (const path of ["/api/payments/status", "/api/payments/subscription", "/api/payments/paytr/callback"]) {
      expect(nativePaymentDecision(path, ANDROID_UA)).toBeNull();
    }
    expect(NATIVE_BLOCKED_APIS).toContain("/api/promo/redeem");
  });

  it("web'e özgü ödeme sayfaları abonelik ekranına, tanıtım sayfaları ana sayfaya yönlenir", () => {
    for (const path of ["/fiyatlandirma", "/odeme/basarili", "/odeme/basarisiz", "/odeme/veli/tesekkurler", "/veli-odeme/abc"]) {
      expect(nativePaymentDecision(path, IOS_UA)).toEqual({ kind: "redirect", to: "/pay" });
    }
    for (const path of ["/ozellikler", "/ornek", "/sinav-hazirligi"]) {
      expect(nativePaymentDecision(path, ANDROID_UA)).toEqual({ kind: "redirect", to: "/" });
    }
    for (const path of ["/pay", "/odemeler", "/ayarlar", "/hesap-silme", "/gizlilik", "/kullanim-kosullari", "/kvkk"]) {
      expect(nativePaymentDecision(path, ANDROID_UA)).toBeNull();
    }
  });

  it("uygulamada oturumsuz ana sayfa kayda gider; oturum açıksa dokunulmaz", () => {
    expect(nativeGuestHomeRedirect("/", ANDROID_UA, false)).toBe("/kayit");
    expect(nativeGuestHomeRedirect("/", ANDROID_UA, true)).toBeNull();
    expect(nativeGuestHomeRedirect("/kayit", ANDROID_UA, false)).toBeNull();
  });
});

describe("uygulamada web ödemesi yok: middleware", async () => {
  const { updateSession } = await import("@/lib/supabase/middleware");
  const request = (path: string, ua: string) => new NextRequest(`http://localhost${path}`, { headers: { "user-agent": ua } });

  beforeEach(() => {
    mw.user = null;
  });

  it("ödeme ucu 403 ve okunur cümle döner", async () => {
    const response = await updateSession(request("/api/payments/paytr/create-token", ANDROID_UA));
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("native_store_only");
    expect(body.message).toMatch(/App Store ya da Google Play/);
  });

  it("veli ödeme sayfası ve fiyat sayfası /pay'e yönlenir; tarayıcıda yönlenmez", async () => {
    const veli = await updateSession(request("/veli-odeme/belirtec", IOS_UA));
    expect(veli.status).toBe(307);
    expect(veli.headers.get("location")).toBe("http://localhost/pay");
    const price = await updateSession(request("/fiyatlandirma?plan=plus", ANDROID_UA));
    expect(price.headers.get("location")).toBe("http://localhost/pay");
    const web = await updateSession(request("/fiyatlandirma", WEB_UA));
    expect(web.headers.get("location")).toBeNull();
  });

  it("uygulamada oturumsuz ana sayfa kayda gider", async () => {
    const response = await updateSession(request("/", ANDROID_UA));
    expect(response.headers.get("location")).toBe("http://localhost/kayit");
    const web = await updateSession(request("/", WEB_UA));
    expect(web.headers.get("location")).toBeNull();
  });
});

describe("uygulamada kalan cümleler için güvenlik ağı", () => {
  it("web'e özgü işaretli öğe ve web ödeme bağlantıları uygulamada gizli; uygulamaya özgü cümle tarayıcıda gizli", () => {
    const css = read("src/styles/native-app.css");
    expect(css).toMatch(/html\.cx-native \[data-web-only\]/);
    expect(css).toMatch(/a\[href\*="\/veli-odeme"\]/);
    expect(css).toMatch(/a\[href\*="paytr\.com"\]/);
    expect(css).toMatch(/html:not\(\.cx-native\) \[data-app-only\]/);
  });

  it("Yardım'da yenileme cümlesi satın alınan yere göre", () => {
    const page = read("src/app/yardim/page.tsx");
    expect(page).toContain('webOnly: "Abonelik kendiliğinden yenilenmez."');
    expect(page).toMatch(/appOnly:\s*\n?\s*"Uygulamada alınan abonelik/);
    expect(page).toContain("data-web-only");
    expect(page).toContain("data-app-only");
  });
});

describe("hesap silme", async () => {
  const { ACCOUNT_DELETION_COPY, DELETED_DATA, RETAINED_DATA } = await import("@/lib/privacy/account-deletion-copy");

  it("silinen ve kalan listeleri silme işçisinin yaptığıyla uyumlu", () => {
    const worker = read("src/lib/privacy/account-deletion.ts");
    for (const table of ["documents", "exam_preps", "messages", "conversations", "mistake_entries", "user_push_tokens", "user_device_sessions"]) {
      expect(worker).toContain(`"${table}"`);
    }
    expect(DELETED_DATA.join(" ")).toMatch(/bildirim cihaz anahtarı/);
    expect(RETAINED_DATA.join(" ")).toMatch(/10 yıla kadar/);
    // Kötüye kullanım kayıtları silinir (abuse_events listede): "saklanır" denmez.
    expect(worker).toContain('"abuse_events"');
    expect(RETAINED_DATA.join(" ")).not.toMatch(/kötüye kullanım/i);
    expect(ACCOUNT_DELETION_COPY.groupDescription).toMatch(/devre dışı bırakma değildir/);
    expect(ACCOUNT_DELETION_COPY.dialogText).toMatch(/geri alınamaz/);
  });

  it("Ayarlar sayfası bölümü #hesabi-sil ile açılır ve satır olarak da bulunur", () => {
    const page = read("src/app/ayarlar/page.tsx");
    expect(page).toContain('id="hesabi-sil"');
    expect(page).toContain('href: "#hesabi-sil"');
    expect(page).toContain("AccountDeletionPanel");
  });

  it("herkese açık sayfa: oturumsuz açılır, onay kapısından muaf, alt bilgide ve site haritasında", async () => {
    expect(read("src/lib/supabase/middleware.ts")).not.toMatch(/"\/hesap-silme"/);
    expect(read("src/components/legal/consent-gate.tsx")).toContain('"/hesap-silme"');
    expect(read("src/components/parity/marketing.tsx")).toContain('href="/hesap-silme"');
    // 27 Kasım 2026 (GEO): site haritasının sayfa listesi `public-pages.ts`'te; haritanın kendi çıktısı okunur.
    const { default: sitemap } = await import("@/app/sitemap");
    const paths = sitemap().map((entry) => new URL(entry.url).pathname);
    expect(paths).toContain("/hesap-silme");
  });
});

describe("giriş yapmadan silme bağlantısı", async () => {
  const env = await import("@/lib/env");
  beforeEach(() => {
    (env.env as { APP_SECRET?: string }).APP_SECRET = "test-secret-for-deletion-links";
  });
  const { createDeletionToken, verifyDeletionToken, maskEmail, DELETION_LINK_TTL_MS } = await import(
    "@/lib/privacy/deletion-link"
  );
  const USER = "8f3a1c2e-1111-4222-8333-944455556666";

  it("imzalı, süreli; bozulan ya da süresi geçen bağlantı açılmaz", () => {
    const now = Date.UTC(2026, 10, 26, 9);
    const token = createDeletionToken(USER, now);
    expect(token).toMatch(/^sil\./);
    expect(verifyDeletionToken(token, now + 1000)).toEqual({ ok: true, userId: USER, expiresAt: now + DELETION_LINK_TTL_MS });
    expect(verifyDeletionToken(token, now + DELETION_LINK_TTL_MS + 1)).toEqual({ ok: false, reason: "expired" });
    const forged = token!.replace(USER, "8f3a1c2e-1111-4222-8333-944455556667");
    expect(verifyDeletionToken(forged, now)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyDeletionToken("sil.x", now)).toEqual({ ok: false, reason: "invalid" });
    expect(createDeletionToken("not-a-uuid", now)).toBeNull();
  });

  it("anahtar yoksa bağlantı ne üretilir ne doğrulanır", () => {
    (env.env as { APP_SECRET?: string }).APP_SECRET = "";
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(createDeletionToken(USER)).toBeNull();
    expect(verifyDeletionToken("sil.a.b.c.d")).toEqual({ ok: false, reason: "unconfigured" });
    error.mockRestore();
  });

  it("onay sayfası e-postayı gizler", () => {
    expect(maskEmail("burhan@gmail.com")).toBe("b***@g***.com");
    expect(maskEmail("")).toBe("");
  });

  it("silme yalnız POST ile; sayfa yalnız okur; talep ucu her zaman aynı cevabı verir", () => {
    const confirmRoute = read("src/app/api/hesap-silme/onay/route.ts");
    expect(confirmRoute).toMatch(/export async function POST/);
    expect(confirmRoute).not.toMatch(/export async function GET/);
    const confirmPage = read("src/app/hesap-silme/onay/page.tsx");
    expect(confirmPage).toContain("previewDeletionToken");
    expect(confirmPage).not.toContain("confirmDeletionByToken");
    const requestRoute = read("src/app/api/hesap-silme/talep/route.ts");
    expect(requestRoute).toContain('return NextResponse.json({ ok: true }');
    expect(requestRoute).toContain("account-delete-email");
  });
});

describe("öğretmen yanıtını bildir", async () => {
  const { replyReportMessage, replyReportSubject, REPLY_REPORT_REASONS } = await import("@/lib/learning/reply-report");

  it("bildirim destek listesine önekli konu ve yanıt parçasıyla düşer", () => {
    expect(replyReportSubject("uygunsuz")).toBe("[Yapay zekâ yanıtı bildirimi] Uygunsuz ya da zararlı");
    const body = replyReportMessage({ reason: "yanlis", messageId: null, excerpt: "a".repeat(4000) });
    expect(body).toContain("Mesaj: kaydedilmemiş yanıt");
    expect(body.length).toBeLessThan(1700);
    expect(REPLY_REPORT_REASONS.map((item) => item.id)).toEqual(["yanlis", "uygunsuz", "diger"]);
  });

  it("uç: kayıtlı yanıtı öğrencinin kendi istemcisiyle okur, olumsuz oy yazar, denetim kaydı bırakır", () => {
    const route = read("src/app/api/ai/chat/report/route.ts");
    // Geçici kimlik (UUID değil) ve başkasının yanıtı: bildirim alınır ama oy yazılmaz.
    expect(route).toContain("UUID.test(rawId)");
    expect(route).toMatch(/if \(!data\) \{\s*\/\/[^\n]*\n[^\n]*\n\s*messageId = null;/);
    expect(route).toMatch(/supabase\s*\n?\s*\.from\("messages"\)/);
    expect(route).toContain('.from("support_requests")');
    expect(route).toContain('action: "ai.reply_reported"');
    const labels = read("src/lib/admin/labels.ts");
    expect(labels).toContain('"ai.reply_reported"');
    expect(labels).toContain('"privacy.account_deleted_by_email"');
  });
});

describe("yapay zekâ notu ve hukuki metinler", async () => {
  const { AI_NOTICE } = await import("@/lib/legal/ai-notice");
  const { TERMS_SECTIONS } = await import("@/lib/legal/terms-text");
  const { KVKK_SECTIONS } = await import("@/lib/legal/kvkk-text");
  const terms = TERMS_SECTIONS.flatMap((section) => [section.heading, ...section.body]).join("\n");
  const kvkk = KVKK_SECTIONS.flatMap((section) => [section.heading, ...section.body]).join("\n");

  it("not ders ve öğretmen ekranında; tavsiye yerine geçmediğini söyler", () => {
    for (const text of Object.values(AI_NOTICE)) {
      expect(text).toMatch(/yapay zekâ/);
      expect(text).toMatch(/resmî sınav kılavuzunun, tıbbi ya da hukuki tavsiyenin yerine geçmez/);
    }
    expect(read("src/components/chat/chat-panel.tsx").match(/<AiNotice kind="teacher"/g)?.length).toBe(2);
    expect(read("src/components/parity/exam-lesson-steps.tsx")).toContain('<AiNotice kind="lesson"');
  });

  it("Kullanım Koşulları web satışını ve mağaza aboneliğini ayırır", () => {
    expect(terms).toContain("Mobil uygulamada mağaza aboneliği");
    expect(terms).toMatch(/en az 24 saat önce iptal edilmezse aynı süre ve aynı fiyatla otomatik olarak yenilenir/);
    expect(terms).toMatch(/Web sitesinden alınan abonelikler otomatik olarak yenilenmez/);
    expect(terms).toMatch(/iadesi Apple'ın ya da Google'ın iade kurallarına göre/);
    expect(terms).toMatch(/Hesabını silmek mağaza aboneliğini kendiliğinden iptal etmez/);
    expect(terms).toMatch(/«?Bildir/);
  });

  it("KVKK metni bildirim anahtarını, sesli öğretmeni ve mağaza sağlayıcılarını sayar", () => {
    expect(kvkk).toMatch(/bildirim cihaz anahtarı/);
    expect(kvkk).toMatch(/canlı sesli öğretmende/);
    expect(kvkk).toMatch(/Apple ve Google — mobil uygulamada bildirimlerin/);
    expect(kvkk).toMatch(/RevenueCat/);
    expect(kvkk).toMatch(/hesap-silme/);
    expect(kvkk).toMatch(/vasi/);
  });

  it("Gizlilik Politikası istenen veri ve sağlayıcı listesini içerir", () => {
    const page = read("src/app/gizlilik/page.tsx");
    for (const word of ["e-posta", "PDF", "fotoğraf", "Sesli öğretmen", "Ödeme geçmişi", "Bildirim cihaz anahtarı", "Sentry"]) {
      expect(page).toContain(word);
    }
    for (const vendor of ["OpenAI", "Supabase", "Vercel", "Resend", "PayTR", "Sentry", "RevenueCat", "Apple ve Google"]) {
      expect(page).toContain(vendor);
    }
    expect(page).toContain("PUBLIC_DELETION_PATH");
  });

  it("hukuki metinlerde köşeli parantezli boş alan kalmadı", () => {
    for (const path of [
      "src/lib/legal/kvkk-text.ts",
      "src/lib/legal/terms-text.ts",
      "src/lib/legal/texts.ts",
      "src/app/gizlilik/page.tsx",
      "src/app/hesap-silme/page.tsx",
    ]) {
      expect(read(path)).not.toMatch(/\[(Şirket|Adres|Unvan|Ünvan|Vergi|Telefon|E-posta|Tarih|Ad Soyad|İl)[^\]]*\]/);
    }
  });

  it("iPhone izin metinleri neden istendiğini söyler; galeriye kendiliğinden kayıt yok", () => {
    const plist = read("ios/App/App/Info.plist");
    expect(plist).toMatch(/<key>NSCameraUsageDescription<\/key>\s*<string>[^<]*taramak/);
    expect(plist).toMatch(/<key>NSMicrophoneUsageDescription<\/key>\s*<string>[^<]*Canlı sesli öğretmen/);
    expect(plist).toMatch(/<key>NSPhotoLibraryAddUsageDescription<\/key>\s*<string>[^<]*kendiliğinden fotoğraf eklemez/);
    expect(plist).not.toContain("Sınav sabahı kâğıdı gibi");
    const manifest = read("android/app/src/main/AndroidManifest.xml");
    const permissions = [...manifest.matchAll(/<uses-permission android:name="([^"]+)" \/>/g)].map((match) => match[1]);
    // Eklentilerin eklediği tam zamanlı alarm izni birleşik bildirimden çıkarılır (Google Play kısıtlı izin).
    expect(manifest).toContain('<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" tools:node="remove" />');
    // Mobil 1. adım (26 Kasım 2026): ders sesi için ön plan medya servisi ve uygulama kilidi. Konum, kişiler, depolama,
    // tam zamanlı alarm (SCHEDULE_EXACT_ALARM) yok; yerel hatırlatma tam olmayan zamanlamayla kurulur.
    expect(permissions.sort()).toEqual(
      [
        "android.permission.INTERNET",
        "android.permission.MODIFY_AUDIO_SETTINGS",
        "android.permission.POST_NOTIFICATIONS",
        "android.permission.RECORD_AUDIO",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
        "android.permission.USE_BIOMETRIC",
      ].sort(),
    );
    expect(plist).toMatch(/<key>NSFaceIDUsageDescription<\/key>\s*<string>[^<]*cihazından çıkmaz/);
    expect(plist).toMatch(/<key>UIBackgroundModes<\/key>\s*<array>\s*<string>audio<\/string>\s*<\/array>/);
  });
});
