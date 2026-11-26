/**
 * Mobil 1. adım (26 Kasım 2026): bugünkü tek kod tabanlı uygulamada biten mağaza işleri.
 * - iOS gizlilik bildirimi (PrivacyInfo.xcprivacy) App Privacy formuyla aynı; Xcode projesine kaynak olarak bağlı.
 * - Arka plan sesi: iOS ses kipi ve izni, Android ön plan medya servisi; kilit ekranı denetimlerinin kuralı.
 * - Yerel çalışma hatırlatması: plan, metin, sunucu anlık bildirimiyle çakışmama; Android'de tam zamanlı alarm yok.
 * - Zorunlu güncelleme: sürüm kuralı ve uç. Uygulama kilidi ve mağaza değerlendirmesinin saf kuralları.
 * - Düelloda bildir ve engelle: ad süzgeci, sıralama süzgeci, uçlar, göç (PGlite; canlıya uygulanmadı).
 * Örnekler ders-bağımsız; canlı model ya da ağ çağrısı yok.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ROOT = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");

// ── Yerel proje ──────────────────────────────────────────────────────────────────────────

describe("iOS gizlilik bildirimi ve yerel proje", () => {
  const manifest = read("ios/App/App/PrivacyInfo.xcprivacy");
  const pbx = read("ios/App/App.xcodeproj/project.pbxproj");

  it("takip yok; gerekçeli API yalnız cihazda ayar saklama (CA92.1)", () => {
    expect(manifest).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
    expect(manifest).toMatch(/<key>NSPrivacyTrackingDomains<\/key>\s*<array\/>/);
    expect(manifest).toContain("<string>NSPrivacyAccessedAPICategoryUserDefaults</string>");
    expect(manifest).toContain("<string>CA92.1</string>");
    expect(manifest).not.toMatch(/<key>NSPrivacyCollectedDataTypeTracking<\/key>\s*<true\/>/);
  });

  it("toplanan veri türleri App Privacy formuyla (uyumluluk belgesi bölüm 2) aynı", () => {
    const types = [...manifest.matchAll(/<string>NSPrivacyCollectedDataType([A-Za-z]+)<\/string>/g)]
      .map((match) => match[1])
      .filter((name) => !name.startsWith("Purpose"));
    expect(types.sort()).toEqual(
      [
        "AudioData",
        "CrashData",
        "CustomerSupport",
        "DeviceID",
        "EmailAddress",
        "Name",
        "OtherDiagnosticData",
        "OtherUserContent",
        "PhotosorVideos",
        "ProductInteraction",
        "PurchaseHistory",
        "UserID",
      ].sort(),
    );
    const doc = read("docs/delivery/MAGAZA-UYUMLULUK-KONTROL.md");
    for (const label of ["Name", "Email Address", "Photos or Videos", "Audio Data", "Purchase History", "User ID", "Device ID", "Crash Data", "Product Interaction"]) {
      expect(doc, label).toContain(label);
    }
    expect(doc).toContain("PrivacyInfo.xcprivacy");
  });

  it("dosyalar Xcode projesinde: bildirim kaynaklarda, eklenti ve denetleyici derlenenlerde", () => {
    const section = (name: string) => pbx.slice(pbx.indexOf(`/* Begin ${name} section */`), pbx.indexOf(`/* End ${name} section */`));
    expect(section("PBXResourcesBuildPhase")).toContain("PrivacyInfo.xcprivacy in Resources");
    expect(section("PBXSourcesBuildPhase")).toContain("CortexDevicePlugin.swift in Sources");
    expect(section("PBXSourcesBuildPhase")).toContain("CortexBridgeViewController.swift in Sources");
    const ids = [...pbx.matchAll(/\b(C0E7A1[0-9A-F]{18})\b/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(6);
  });

  it("eklenti köprüye kaydedilir; sahne ve film şeridi aynı denetleyiciyi kullanır", () => {
    expect(read("ios/App/App/CortexBridgeViewController.swift")).toContain("bridge?.registerPluginInstance(CortexDevicePlugin())");
    expect(read("ios/App/App/SceneDelegate.swift")).toContain("CortexBridgeViewController()");
    expect(read("ios/App/App/Base.lproj/Main.storyboard")).toContain('customClass="CortexBridgeViewController" customModule="App"');
    const swift = read("ios/App/App/CortexDevicePlugin.swift");
    for (const method of ["biometricStatus", "biometricVerify", "requestReview", "mediaUpdate", "mediaStop"]) {
      expect(swift, method).toContain(`CAPPluginMethod(name: "${method}"`);
    }
    expect(swift).toContain('public let jsName = "CortexDevice"');
    expect(swift).toContain(".deviceOwnerAuthentication");
  });

  it("arka plan sesi: çalma kipi, UIBackgroundModes audio; Face ID açıklaması; arm64", () => {
    expect(read("ios/App/App/AppDelegate.swift")).toContain("setCategory(.playback, mode: .spokenAudio");
    const plist = read("ios/App/App/Info.plist");
    expect(plist).toMatch(/<key>UIBackgroundModes<\/key>\s*<array>\s*<string>audio<\/string>\s*<\/array>/);
    expect(plist).toMatch(/<key>NSFaceIDUsageDescription<\/key>\s*<string>[^<]+<\/string>/);
    expect(plist).toContain("<string>arm64</string>");
    expect(plist).not.toContain("<string>armv7</string>");
  });

  it("Android: eklenti kayıtlı, medya servisi dışa kapalı ve mediaPlayback türünde, bağımlılıklar sabit sürümde", () => {
    expect(read("android/app/src/main/java/app/cortexplus/mobile/MainActivity.java")).toContain("registerPlugin(CortexDevicePlugin.class)");
    const java = read("android/app/src/main/java/app/cortexplus/mobile/CortexDevicePlugin.java");
    expect(java).toContain('@CapacitorPlugin(name = "CortexDevice")');
    for (const method of ["biometricStatus", "biometricVerify", "requestReview", "mediaUpdate", "mediaStop"]) {
      expect(java, method).toContain(`public void ${method}(PluginCall call)`);
    }
    const manifest = read("android/app/src/main/AndroidManifest.xml");
    expect(manifest).toMatch(/android:name="\.CortexMediaService"\s+android:exported="false"\s+android:foregroundServiceType="mediaPlayback"/);
    const gradle = read("android/app/build.gradle");
    for (const dep of ["androidx.biometric:biometric", "androidx.media:media", "com.google.android.play:review"]) expect(gradle).toContain(dep);
    const variables = read("android/variables.gradle");
    expect(variables).toMatch(/androidxBiometricVersion = '\d+\.\d+\.\d+'/);
    expect(variables).toMatch(/playReviewVersion = '\d+\.\d+\.\d+'/);
  });
});

// ── Sürüm kuralı ───────────────────────────────────────────────────────────────────────────

describe("zorunlu güncelleme", async () => {
  const { appVersionStatus, compareVersions, storeUrl, versionPolicy } = await import("@/lib/platform/app-version");

  it("sürüm karşılaştırması sayı sayı; '1.0' ile '1.0.0' eşit", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.2", "1.10")).toBe(-1);
    expect(compareVersions("2.0.1", "2.0")).toBe(1);
  });

  it("en düşük sürümün altı zorunlu, son sürümün altı öneri; tanınmayan sürüm kimseyi kilitlemez", () => {
    const env = { MOBILE_MIN_VERSION_IOS: "1.2", MOBILE_LATEST_VERSION_IOS: "1.4" };
    expect(appVersionStatus("ios", "1.1.9", env)).toBe("update_required");
    expect(appVersionStatus("ios", "1.3", env)).toBe("update_available");
    expect(appVersionStatus("ios", "1.4.0", env)).toBe("ok");
    expect(appVersionStatus("ios", "bilinmiyor", env)).toBe("ok");
    expect(appVersionStatus("ios", null, env)).toBe("ok");
    // Android'in kuralı ayrı.
    expect(appVersionStatus("android", "1.1", env)).toBe("ok");
    // Son sürüm en düşük sürümün altına yazılırsa en düşük sürüme çekilir.
    expect(versionPolicy("android", { MOBILE_MIN_VERSION_ANDROID: "2.0", MOBILE_LATEST_VERSION_ANDROID: "1.5" }).latest).toBe("2.0");
    expect(versionPolicy("android", { MOBILE_MIN_VERSION_ANDROID: "2;DROP" }).minimum).toBe("1.0");
  });

  it("mağaza adresi: Play paket adından, App Store yalnız geçerli kimlik tanımlıysa", () => {
    expect(storeUrl("android", {})).toBe("https://play.google.com/store/apps/details?id=app.cortexplus.mobile");
    expect(storeUrl("ios", {})).toBeNull();
    expect(storeUrl("ios", { APPLE_APP_STORE_ID: "1234567890" })).toBe("https://apps.apple.com/tr/app/id1234567890");
    expect(storeUrl("ios", { APPLE_APP_STORE_ID: "javascript:alert(1)" })).toBeNull();
  });

  it("uç: platform zorunlu, durum ve mağaza adresi döner", async () => {
    const { GET } = await import("@/app/api/app/version/route");
    expect((await GET(new Request("https://cortexplus.app/api/app/version?platform=web"))).status).toBe(400);
    const response = await GET(new Request("https://cortexplus.app/api/app/version?platform=android&version=1.0"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; storeUrl: string | null };
    expect(body.status).toBe("ok");
    expect(body.storeUrl).toContain("play.google.com");
  });
});

// ── Yerel hatırlatma ───────────────────────────────────────────────────────────────────────

describe("yerel çalışma hatırlatması", async () => {
  const { buildLocalReminderPlan, pickReminderPrep, LOCAL_REMINDER_ID_BASE } = await import("@/lib/notifications/local-reminders");
  const prep = { id: "11111111-2222-4333-8444-555555555555", title: "Fizik ara sınavı", examDate: null as string | null };
  const base = { inAppNotifications: true, studyHour: 19 as const, prep, studiedToday: false };

  it("öğrencinin saatinde, Türkiye saatiyle; bugün çalıştıysa ilk hatırlatma yarın", () => {
    const now = new Date("2026-11-26T10:00:00Z"); // İstanbul 13:00
    const plan = buildLocalReminderPlan({ ...base, now });
    expect(plan.enabled).toBe(true);
    expect(plan.items).toHaveLength(14);
    expect(plan.items[0]).toMatchObject({ id: LOCAL_REMINDER_ID_BASE, at: "2026-11-26T16:00:00.000Z", path: `/deneme-sinavlari/${prep.id}` });
    const studied = buildLocalReminderPlan({ ...base, now, studiedToday: true });
    expect(studied.items[0]!.at).toBe("2026-11-27T16:00:00.000Z");
    const half = buildLocalReminderPlan({ ...base, now, studyHour: 18 });
    expect(half.items[0]!.at).toBe("2026-11-26T15:30:00.000Z");
  });

  it("saati geçmiş (ya da 5 dakikadan az kalmış) bugün atlanır", () => {
    const plan = buildLocalReminderPlan({ ...base, now: new Date("2026-11-26T15:57:00Z") });
    expect(plan.items[0]!.at).toBe("2026-11-27T16:00:00.000Z");
  });

  it("sınava kalan gün sayılır; sınav günü ve sonrası hatırlatma yok", () => {
    const plan = buildLocalReminderPlan({ ...base, now: new Date("2026-11-26T10:00:00Z"), prep: { ...prep, examDate: "2026-11-30" } });
    expect(plan.items.map((item) => item.title)).toEqual(["Sınavına 4 gün kaldı", "Sınavına 3 gün kaldı", "Sınavına 2 gün kaldı", "Yarın sınavın var"]);
    expect(plan.items[0]!.body).toContain("Fizik ara sınavı");
  });

  it("uzak sınavda ve tarihsizde dönen dost cümleleri; kapalı tercih ya da hazırlık yoksa plan yok", () => {
    const plan = buildLocalReminderPlan({ ...base, now: new Date("2026-11-26T10:00:00Z"), prep: { ...prep, examDate: "2027-03-01" } });
    expect(new Set(plan.items.map((item) => item.title)).size).toBe(3);
    expect(plan.items.every((item) => !/kredi|satın|Plus/i.test(`${item.title} ${item.body}`))).toBe(true);
    expect(buildLocalReminderPlan({ ...base, now: new Date(), inAppNotifications: false })).toEqual({ enabled: false, items: [] });
    expect(buildLocalReminderPlan({ ...base, now: new Date(), prep: null })).toEqual({ enabled: false, items: [] });
  });

  it("anılan hazırlık: bitmemiş yolu olan, geçici deneme kaydı olmayan, sınavı en yakın olan", () => {
    const preps = [
      { id: "a", title: "A", exam_date: "2026-12-20", exam_type: "tyt", created_at: "2026-11-01" },
      { id: "b", title: "B", exam_date: "2026-12-05", exam_type: "deneme", created_at: "2026-11-02" },
      { id: "c", title: "C", exam_date: "2026-12-10", exam_type: "ales", created_at: "2026-11-03" },
      { id: "d", title: "D", exam_date: null, exam_type: "tyt", created_at: "2026-11-20" },
    ];
    expect(pickReminderPrep(preps, new Set(["a", "b", "c", "d"]), () => true)?.id).toBe("c");
    expect(pickReminderPrep(preps, new Set(["a", "d"]), () => true)?.id).toBe("a");
    expect(pickReminderPrep(preps, new Set(["d"]), () => true)?.id).toBe("d");
    expect(pickReminderPrep(preps, new Set(["d"]), () => false)).toBeNull();
  });

  it("sunucunun çalışma hatırlatması son 14 günde açılmış cihaza anlık bildirimle gitmez (çift bildirim yok)", async () => {
    const { pushTargetRows } = await import("@/lib/notifications/push");
    const now = new Date("2026-11-26T16:00:00Z");
    const rows = [
      { token: "yeni-cihaz-anahtari-1", platform: "ios", updated_at: "2026-11-24T10:00:00Z" },
      { token: "eski-cihaz-anahtari-2", platform: "android", updated_at: "2026-11-01T10:00:00Z" },
      { token: "tarihsiz-anahtar-3", platform: "android", updated_at: null },
    ];
    expect(pushTargetRows(rows, "study_reminder", now).map((row) => row.token)).toEqual(["eski-cihaz-anahtari-2", "tarihsiz-anahtar-3"]);
    expect(pushTargetRows(rows, "video_ready", now)).toHaveLength(3);
    expect(pushTargetRows(rows, undefined, now)).toHaveLength(3);
    expect(read("src/lib/notifications/in-app.ts")).toContain("kind: row.kind,");
  });

  it("telefon tarafı: yalnız bizim aralığımızdaki, gelecekteki, uygulama içi yollu öğeler kurulur; izin istenmez", async () => {
    const { validReminderItems } = await import("@/lib/platform/native-reminders");
    const now = Date.parse("2026-11-26T10:00:00Z");
    const ok = { id: LOCAL_REMINDER_ID_BASE + 1, at: "2026-11-27T16:00:00.000Z", title: "T", body: "B", path: "/deneme-sinavlari/x" };
    const items = validReminderItems(
      {
        items: [
          ok,
          { ...ok, id: 5 },
          { ...ok, at: "2026-11-20T16:00:00.000Z" },
          { ...ok, path: "https://kotu.example/x" },
          { ...ok, path: "//kotu.example" },
        ],
      },
      now,
    );
    expect(items).toEqual([ok]);
    expect(validReminderItems(null, now)).toEqual([]);
    const source = read("src/lib/platform/native-reminders.ts");
    expect(source).not.toContain("requestPermissions");
    expect(source).toContain("isExactNotification: false");
    expect(read("android/app/src/main/AndroidManifest.xml")).toContain(
      '<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" tools:node="remove" />',
    );
  });
});

describe("yerel hatırlatma ucu", async () => {
  const userId = "99999999-8888-4777-8666-555555555555";
  const preps = [{ id: "p1", title: "Kimya", exam_date: "2026-12-10", exam_type: "tyt", created_at: "2026-11-01" }];
  const builder = () => {
    const chain: Record<string, unknown> = {};
    for (const key of ["select", "eq", "or", "order"]) chain[key] = () => chain;
    chain.limit = async () => ({ data: preps, error: null });
    return chain;
  };
  vi.doMock("@/lib/api/guards", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/api/guards")>()),
    withUser: vi.fn(async () => ({ ok: true, ctx: { userId, service: { from: () => builder() } } })),
  }));
  vi.doMock("@/lib/learning/reminder-facts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/learning/reminder-facts")>()),
    lastActivityByUser: vi.fn(async () => new Map()),
    unfinishedPrepIds: vi.fn(async () => new Set(["p1"])),
  }));
  vi.doMock("@/lib/notifications/preferences", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/notifications/preferences")>();
    return { ...actual, loadNotificationPreferences: vi.fn(async () => ({ ...actual.DEFAULT_NOTIFICATION_PREFERENCES })) };
  });

  it("öğrencinin planını döndürür (önbelleksiz)", async () => {
    const { GET } = await import("@/app/api/app/reminders/route");
    const response = await GET(new Request("https://cortexplus.app/api/app/reminders"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const plan = (await response.json()) as { enabled: boolean; items: { path: string }[] };
    expect(plan.enabled).toBe(true);
    expect(plan.items[0]!.path).toBe("/deneme-sinavlari/p1");
  });
});

// ── Kilit, değerlendirme, medya ────────────────────────────────────────────────────────────

describe("uygulama kilidi, mağaza değerlendirmesi, kilit ekranı denetimleri", async () => {
  const { shouldLockOnResume, lockLabel, LOCK_AFTER_BACKGROUND_MS } = await import("@/lib/platform/native-lock");
  const { parseReviewState, reviewDue, isReviewWin, REVIEW_MIN_AGE_MS, REVIEW_GAP_MS } = await import("@/lib/platform/native-review");
  const { mediaStateChanged } = await import("@/lib/platform/native-media");

  it("kilit bir dakikadan uzun arka plandan sonra; ad telefonun yöntemine göre", () => {
    const now = 1_000_000;
    expect(shouldLockOnResume(true, now - LOCK_AFTER_BACKGROUND_MS, now)).toBe(true);
    expect(shouldLockOnResume(true, now - 30_000, now)).toBe(false);
    expect(shouldLockOnResume(false, now - 10 * LOCK_AFTER_BACKGROUND_MS, now)).toBe(false);
    expect(shouldLockOnResume(true, null, now)).toBe(false);
    expect(lockLabel("face", "ios")).toBe("Face ID ile kilitle");
    expect(lockLabel("fingerprint", "ios")).toBe("Touch ID ile kilitle");
    expect(lockLabel("biometric", "android")).toBe("Parmak izi ya da yüz tanımayla kilitle");
    expect(lockLabel("passcode", "android")).toBe("Telefon şifresiyle kilitle");
  });

  it("değerlendirme: 3 başarı, 3 gün, 120 gün ara; başarı %80 ve üstü", () => {
    const now = 10 * REVIEW_GAP_MS;
    expect(parseReviewState("bozuk", now)).toEqual({ since: now, wins: 0, askedAt: null });
    expect(reviewDue({ since: now - REVIEW_MIN_AGE_MS, wins: 3, askedAt: null }, now)).toBe(true);
    expect(reviewDue({ since: now - REVIEW_MIN_AGE_MS + 1, wins: 3, askedAt: null }, now)).toBe(false);
    expect(reviewDue({ since: 0, wins: 2, askedAt: null }, now)).toBe(false);
    expect(reviewDue({ since: 0, wins: 9, askedAt: now - REVIEW_GAP_MS + 1 }, now)).toBe(false);
    expect(reviewDue({ since: 0, wins: 9, askedAt: now - REVIEW_GAP_MS }, now)).toBe(true);
    expect(isReviewWin(4, 5)).toBe(true);
    expect(isReviewWin(3, 5)).toBe(false);
    expect(isReviewWin(0, 0)).toBe(false);
    // Kendi "Bizi değerlendir" ekranımız yok: pencereyi mağaza açar.
    expect(read("src/lib/platform/native-review.ts")).toContain("plugin.requestReview()");
  });

  it("kilit ekranı bilgisi yalnız anlamlı değişimde yenilenir", () => {
    const state = {
      title: "Bölüm",
      artist: "Cortex Plus",
      album: "Sınav Radyosu",
      playing: true,
      positionMs: 10_000,
      durationMs: 600_000,
      rate: 1,
      canPrevious: true,
      canNext: true,
    };
    expect(mediaStateChanged(null, state, 0)).toBe(true);
    const sent = { state, at: 0 };
    expect(mediaStateChanged(sent, { ...state, positionMs: 12_000 }, 2_000)).toBe(false);
    expect(mediaStateChanged(sent, { ...state, positionMs: 40_000 }, 2_000)).toBe(true);
    expect(mediaStateChanged(sent, { ...state, playing: false, positionMs: 12_000 }, 2_000)).toBe(true);
    expect(mediaStateChanged(sent, { ...state, title: "Sonraki", positionMs: 12_000 }, 2_000)).toBe(true);
  });

  it("radyo ve podcast oynatıcısı aynı kancayı kullanır; değerlendirme yaşam döngüsü kancasında", () => {
    expect(read("src/components/parity/prep-radio.tsx")).toContain("useNativeMediaControls(");
    expect(read("src/components/parity/exam-podcast-player.tsx")).toContain("useNativeMediaControls(");
    expect(read("src/components/parity/exam-node/use-node-lifecycle.ts")).toContain("void noteLearningWin()");
  });
});

// ── Düello: ad süzgeci, sıralama, uçlar, göç ──────────────────────────────────────────────────

describe("görünen ad süzgeci", async () => {
  const { isOffensiveName, normalizeName } = await import("@/lib/moderation/display-name-filter");

  it("küfür ve hakaret: rakamla, noktayla, harf tekrarıyla yazılsa da", () => {
    for (const name of ["orospu", "0r0spu", "S.i.k.t.i.r", "siktirrr", "Ahmet amk", "ibne", "FUCK you", "Kahpe", "sürtük"]) {
      expect(isOffensiveName(name), name).toBe(true);
    }
  });

  it("masum adlar geçer (başka sözcüklerin içinde geçen kısa kökler sayılmaz, ı ile i ayrı)", () => {
    for (const name of ["Amina Koç", "Kamil", "Gökhan", "Sıkı Çalışan", "Sikke", "Niger", "Ali Bne", "Göktürk", "Can", "Pıçak", "Ayşe"]) {
      expect(isOffensiveName(name), name).toBe(false);
    }
    expect(isOffensiveName("")).toBe(false);
    expect(normalizeName("AAAhmet")).toBe("ahmet");
  });

  it("misafirin uygunsuz adı kayda girmez; sıralama okuyucusu tek yerden", () => {
    const run = read("src/app/api/duels/[code]/run/route.ts");
    expect(run).toContain("isOffensiveName(displayName)");
    expect(run).toContain("loadDuelBoard(");
    expect(read("src/app/duello/[code]/page.tsx")).toContain("loadDuelBoard(");
    expect(read("src/components/duel/duel-play.tsx")).toContain("NAME_NOT_ALLOWED_MESSAGE");
  });
});

describe("düello sıralaması süzgeci", async () => {
  const { hiddenRunsFromReports, moderateBoard } = await import("@/lib/learning/duel-board");
  const run = (id: string, name: string, player: string | null = null, score = 100) => ({
    id,
    player_id: player,
    display_name: name,
    score,
    correct: 5,
  });

  it("yönetici gizlediyse ya da iki ayrı kişi 'uygunsuz ad' dediyse ad gizlenir", () => {
    const reports = [
      { run_id: "r1", status: "hidden", reason: "cheating", reporter_id: "u1", reporter_hash: null },
      { run_id: "r2", status: "open", reason: "offensive_name", reporter_id: "u1", reporter_hash: null },
      { run_id: "r2", status: "open", reason: "offensive_name", reporter_id: null, reporter_hash: "ip-ozeti-0000000001" },
      { run_id: "r3", status: "open", reason: "offensive_name", reporter_id: "u1", reporter_hash: null },
      { run_id: "r3", status: "open", reason: "offensive_name", reporter_id: "u1", reporter_hash: null },
      { run_id: "r4", status: "dismissed", reason: "offensive_name", reporter_id: "u1", reporter_hash: null },
      { run_id: "r4", status: "dismissed", reason: "offensive_name", reporter_id: "u2", reporter_hash: null },
    ];
    expect([...hiddenRunsFromReports(reports)].sort()).toEqual(["r1", "r2"]);
  });

  it("engellenen kişi ve tur görüntüleyenin sıralamasında yok; kendi turu her zaman görünür; ad süzgeci de uygulanır", () => {
    const rows = moderateBoard(
      [run("r1", "Deniz", "p1"), run("r2", "Ece", "viewer"), run("r3", "Misafir", null), run("r4", "orospu", null), run("r5", "Mert", "p5")],
      { hiddenRuns: new Set(["r5"]), blockedUsers: new Set(["p1", "viewer"]), blockedRuns: new Set(["r3"]) },
      "viewer",
    );
    expect(rows.map((row) => [row.runId, row.name, row.own])).toEqual([
      ["r2", "Ece", true],
      ["r4", "Oyuncu", false],
      ["r5", "Oyuncu", false],
    ]);
  });
});

describe("düello bildir ve engelle uçları", () => {
  const USER = "99999999-8888-4777-8666-555555555555";
  const RUN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const state = {
    user: null as string | null,
    run: { id: RUN, player_id: "11111111-1111-4111-8111-111111111111", display_name: "Deniz" } as Record<string, unknown> | null,
    insertError: null as { code?: string; message?: string } | null,
    inserts: [] as { table: string; row: Record<string, unknown> }[],
  };
  const service = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = async () => ({ data: table === "prep_duels" ? { id: "duel-1" } : state.run, error: null });
      chain.insert = async (row: Record<string, unknown>) => {
        state.inserts.push({ table, row });
        return { error: state.insertError };
      };
      return chain;
    },
  };

  beforeAll(() => {
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceClient: () => service,
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user ? { id: state.user } : null } }) } }),
    }));
    vi.doMock("@/lib/api/guards", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/api/guards")>()),
      guestLimit: vi.fn(async () => null),
    }));
  });

  beforeEach(() => {
    state.user = null;
    state.run = { id: RUN, player_id: "11111111-1111-4111-8111-111111111111", display_name: "Deniz" };
    state.insertError = null;
    state.inserts = [];
  });

  const post = (body: unknown, ip = "203.0.113.7") =>
    new Request("https://cortexplus.app/api/duels/abc123/x", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    });
  const params = { params: Promise.resolve({ code: "abc123" }) };

  it("misafir de bildirir (IP özetiyle); kendi turunu bildiremez; aynı bildirim ikinci kez başarılı", async () => {
    const { POST } = await import("@/app/api/duels/[code]/report/route");
    const guest = await POST(post({ runId: RUN, reason: "offensive_name", note: "  kötü ad  " }), params);
    expect(guest.status).toBe(200);
    const row = state.inserts[0]!.row;
    expect(row).toMatchObject({ run_id: RUN, reporter_id: null, reason: "offensive_name", note: "kötü ad", reported_name: "Deniz" });
    expect(String(row.reporter_hash)).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(row)).not.toContain("203.0.113.7");

    state.user = "11111111-1111-4111-8111-111111111111";
    expect((await POST(post({ runId: RUN, reason: "cheating" }), params)).status).toBe(400);

    state.user = USER;
    state.insertError = { code: "23505" };
    expect((await POST(post({ runId: RUN, reason: "other" }), params)).status).toBe(200);
    expect((await POST(post({ runId: RUN, reason: "spam" }), params)).status).toBe(400);
  });

  it("tablo yoksa (göçten önce) bildirim 503 ve açık bir cümle", async () => {
    const { POST } = await import("@/app/api/duels/[code]/report/route");
    state.insertError = { code: "42P01", message: 'relation "public.duel_reports" does not exist' };
    const response = await POST(post({ runId: RUN, reason: "offensive_name" }), params);
    expect(response.status).toBe(503);
    expect(((await response.json()) as { message: string }).message).toContain("şu an alınamıyor");
  });

  it("engelleme oturum ister; hesaplı oyuncu kişi olarak, misafir turuyla engellenir; kendini engelleyemez", async () => {
    const { POST } = await import("@/app/api/duels/[code]/block/route");
    expect((await POST(post({ runId: RUN }), params)).status).toBe(401);
    state.user = USER;
    expect((await POST(post({ runId: RUN }), params)).status).toBe(200);
    expect(state.inserts[0]!.row).toMatchObject({ blocker_id: USER, blocked_user_id: "11111111-1111-4111-8111-111111111111", blocked_run_id: null });
    state.run = { id: RUN, player_id: null, display_name: "orospu" };
    expect((await POST(post({ runId: RUN }), params)).status).toBe(200);
    expect(state.inserts[1]!.row).toMatchObject({ blocked_user_id: null, blocked_run_id: RUN, blocked_name: "Oyuncu" });
    state.run = { id: RUN, player_id: USER, display_name: "Ben" };
    expect((await POST(post({ runId: RUN }), params)).status).toBe(400);
  });

  it("hesap silmede engel ve bildirimler temizlenir; yönetici kuyruğu ve kayıt adları Türkçe", () => {
    const deletion = read("src/lib/privacy/account-deletion.ts");
    for (const pair of ['["duel_blocks", "blocker_id", "delete"]', '["duel_reports", "reporter_id", "delete"]', '["duel_reports", "reported_user_id", "clear"]']) {
      expect(deletion).toContain(pair);
    }
    const labels = read("src/lib/admin/labels.ts");
    expect(labels).toContain('"duel.report_hidden"');
    expect(labels).toContain('"duel.report_dismissed"');
    expect(read("src/lib/admin/nav.ts")).toContain('href: "/admin/duello-bildirimleri"');
  });
});

describe("göç: düello bildirim ve engel tabloları (PGlite)", () => {
  const db = new PGlite();
  const MIGRATION = "supabase/migrations/20261126180000_duel_reports_blocks.sql";
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  const C = "33333333-3333-4333-8333-333333333333";
  const DUEL = "44444444-4444-4444-8444-444444444444";
  const RUN = "55555555-5555-4555-8555-555555555555";

  beforeAll(async () => {
    await db.exec(`
      DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      CREATE TABLE public.profiles (id uuid PRIMARY KEY);
      CREATE TABLE public.prep_duels (id uuid PRIMARY KEY, creator_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE);
      CREATE TABLE public.prep_duel_runs (
        id uuid PRIMARY KEY,
        duel_id uuid NOT NULL REFERENCES public.prep_duels (id) ON DELETE CASCADE,
        player_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
        display_name text NOT NULL
      );
    `);
    await db.query(`INSERT INTO public.profiles (id) VALUES ($1), ($2), ($3)`, [A, B, C]);
    await db.query(`INSERT INTO public.prep_duels (id, creator_id) VALUES ($1, $2)`, [DUEL, A]);
    await db.query(`INSERT INTO public.prep_duel_runs (id, duel_id, player_id, display_name) VALUES ($1, $2, $3, 'Deniz')`, [RUN, DUEL, B]);
    await db.exec(read(MIGRATION));
    await db.exec(read(MIGRATION));
  });

  afterAll(async () => {
    await db.close();
  });

  it("tarayıcı rolleri erişemez; satır güvenliği açık", async () => {
    for (const table of ["duel_reports", "duel_blocks"]) {
      const { rows } = await db.query<{ relrowsecurity: boolean }>(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.${table}'::regclass`);
      expect(rows[0]!.relrowsecurity, table).toBe(true);
      for (const role of ["anon", "authenticated"]) {
        const { rows: grants } = await db.query<{ ok: boolean }>(
          `SELECT has_table_privilege($1, 'public.${table}', 'SELECT') OR has_table_privilege($1, 'public.${table}', 'INSERT') AS ok`,
          [role],
        );
        expect(grants[0]!.ok, `${table} ${role}`).toBe(false);
      }
    }
  });

  it("bildirim: aynı kişi aynı turu bir kez; misafir IP özetiyle bir kez; neden ve not sınırlı", async () => {
    const insert = (reporter: string | null, hash: string | null, reason = "offensive_name") =>
      db.query(
        `INSERT INTO public.duel_reports (duel_id, run_id, reporter_id, reporter_hash, reported_user_id, reported_name, reason)
         VALUES ($1, $2, $3, $4, $5, 'Deniz', $6)`,
        [DUEL, RUN, reporter, hash, B, reason],
      );
    await insert(A, null);
    await expect(insert(A, null)).rejects.toThrow();
    await insert(null, "ip-ozeti-000000000001");
    await expect(insert(null, "ip-ozeti-000000000001")).rejects.toThrow();
    await insert(C, null);
    await expect(insert(C, null, "spam")).rejects.toThrow();
  });

  it("engel: hedef kişi ya da tur (ikisi birden değil); kendini engelleyemez; çift engel yok", async () => {
    const block = (blocker: string, user: string | null, run: string | null) =>
      db.query(`INSERT INTO public.duel_blocks (blocker_id, blocked_user_id, blocked_run_id, blocked_name) VALUES ($1, $2, $3, 'Deniz')`, [blocker, user, run]);
    await block(A, B, null);
    await expect(block(A, B, null)).rejects.toThrow();
    await expect(block(A, null, null)).rejects.toThrow();
    await expect(block(A, B, RUN)).rejects.toThrow();
    await expect(block(A, A, null)).rejects.toThrow();
    await block(C, null, RUN);
  });

  it("hesap silinince engeller gider, bildirimin bildireni boşalır (kısıt silmeyi düşürmez)", async () => {
    await db.query(`DELETE FROM public.profiles WHERE id = $1`, [C]);
    const { rows: blocks } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.duel_blocks WHERE blocker_id = $1`, [C]);
    expect(blocks[0]!.n).toBe(0);
    const { rows: reports } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.duel_reports WHERE reporter_id IS NULL AND reporter_hash IS NULL`);
    expect(reports[0]!.n).toBe(1);
  });

  it("göç yalnız ekler: var olan tablolara dokunmaz", () => {
    const sql = read(MIGRATION).replace(/--[^\n]*\n/g, "\n");
    expect(sql).not.toMatch(/^\s*(DROP|DELETE FROM|TRUNCATE|UPDATE)\b/im);
    expect(sql).not.toMatch(/ALTER TABLE public\.(prep_duels|prep_duel_runs|profiles)\b/i);
  });
});
