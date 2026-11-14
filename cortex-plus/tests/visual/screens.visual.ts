import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import { CONSENT_COOKIE } from "../e2e/consent-cookie";

/*
  Görsel taban çizgisi (Faz 0, 2.6). Her rota × 3 genişlik (`visual.config.ts` projeleri) `e2e-plus` ile; plan farkı
  olan rotalar ayrıca `e2e-free-fresh`, `e2e-free-exhausted`, `e2e-sigma` ve kurucu (fikstür) ile. Dinamik rotalar
  tohum betiğinin hazırlığını, ilk ders düğümünü ve belgesini kullanır (`tests/.auth/e2e-state.json`).

  Kararlılık: animasyon kapalı (toHaveScreenshot), hareket azaltma, sabit saat (`page.clock.setFixedTime`), yazı tipleri
  yüklenince ve sayfaya özgü "hazır" seçicisi görününce çekilir (networkidle değil). Tarih, saat, kalan gün, hak sayacı,
  avatar, logo hareket katmanı ve kanvas maskelenir. Hiçbir düğmeye basılmaz (profil paneli dışında: yalnız açar).
*/

const AUTH = path.join(__dirname, "../.auth");
const stateFile = path.join(AUTH, "e2e-state.json");
const STATE: { users: Record<string, Record<string, string | null>> } = fs.existsSync(stateFile)
  ? JSON.parse(fs.readFileSync(stateFile, "utf8"))
  : { users: {} };
const FIXED_NOW = new Date("2026-11-14T12:00:00+03:00");

type Ctx = Record<string, string | null | undefined>;
type Route = { name: string; path: string | ((c: Ctx) => string | null); ready?: string; desktopOnly?: string; open?: (page: Page) => Promise<void> };
type MatrixRoute = { name: string; path: string; ready?: string };

/** Rota listesi denetimle ortak: route-matrix.json. {prepId} gibi alanlar tohum durumundan dolar; yoksa test atlanır. */
const MATRIX: {
  routes: MatrixRoute[];
  profilePanel: MatrixRoute;
  planRoutes: string[];
  planUsers: string[];
  founderRoutes: MatrixRoute[];
} = JSON.parse(fs.readFileSync(path.join(__dirname, "route-matrix.json"), "utf8"));

const templated = (r: MatrixRoute): Route => ({
  ...r,
  path: r.path.includes("{")
    ? (c: Ctx) => {
        let missing = false;
        const url = r.path.replace(/\{(\w+)\}/g, (_, key: string) => {
          const value = c?.[key];
          if (!value) missing = true;
          return value ?? "";
        });
        return missing ? null : url;
      }
    : r.path,
});

const H1 = "h1";
const ROUTES: Route[] = MATRIX.routes.map(templated);

const openProfilePanel = async (page: Page) => {
  // Panel verisi açılınca gelir (`/api/student/profile-panel`); gelmeden çekilirse satırlar ~18 px kayık kalır.
  const data = page.waitForResponse((r) => r.url().includes("/api/student/profile-panel"), { timeout: 30_000 }).catch(() => null);
  await page.locator("button.cx-capsule").first().click();
  await page.locator(".cx-pp-panel").first().waitFor({ state: "visible" });
  await data;
};
const PROFILE_PANEL: Route = {
  ...templated(MATRIX.profilePanel),
  desktopOnly: "telefonda kapsül yok; Profil sekmesi /profil sayfasını açar (o sayfa ayrıca çekiliyor)",
  open: openProfilePanel,
};

/** Plan farkı olan rotalar (prompt 2.6). */
const PLAN_ROUTES = MATRIX.planRoutes;
const PLAN_USERS = MATRIX.planUsers;

/** Kurucu gerçek hesap değil (05-test-hesaplari.md): aynı kodu çizen fikstürler. /araclar, /ilerleme ve hazırlık sayfası için kurucu fikstürü yok. */
const FOUNDER_ROUTES: Route[] = MATRIX.founderRoutes.map(templated);

const MASK_SELECTORS = [
  "time", "[datetime]", "canvas", "video", ".cx-home-logo .lg", ".cx-pring", "[class*='countdown']", ".cp-quota-reset",
].join(", ");

/** Kendi metni tarih, saat, kalan süre ya da sayaç olan öğeleri işaretler (maskelenir). */
async function markDynamic(page: Page) {
  await page.evaluate(() => {
    const MONTHS = "Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık|Oca|Şub|Mar|Nis|May|Haz|Tem|Ağu|Eyl|Eki|Kas|Ara";
    const patterns = [
      new RegExp(`\\b\\d{1,2}\\s+(${MONTHS})\\b`, "i"),
      /\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/,
      /\b\d{1,2}:\d{2}\b/,
      /\b\d+\s+(gün|saat|dakika|dk|hafta|ay)\b.*\b(kaldı|sonra|önce|içinde)\b/i,
      /\b(kaldı|sonra|önce)\b.*\b\d+\s+(gün|saat|dakika|dk)\b/i,
      /^\s*\d+\s*\/\s*\d+\s*$/,
      /%\s?\d+\s+kullanıldı/i,
    ];
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? "")
        .join(" ")
        .trim();
      if (own && own.length <= 120 && patterns.some((p) => p.test(own))) el.setAttribute("data-visual-mask", "");
    }
  });
}

/*
  Sabit saate bağlı başlangıç durumu (14 Kasım 2026). Çerez okuyucusu (`src/lib/consent/cookie-consent.ts:41`) zaman
  damgası sayfanın "şimdi"sinden 5 dakikadan ileride olan tercihi geçersiz sayar. Damga girişin gerçek anı olunca, sabit
  saatten (12:00) sonra yapılan her girişte bant ekranın altını kaplıyordu: aynı test günün saatine göre farklı görüntü
  üretiyordu. Tercih her bağlamda sabit saatten bir saat önceki damgayla yazılır. İlk ziyaretteki "Seri" penceresinin
  görülmüş işareti de her bağlamda yazılır (kurucu fikstürü giriş dosyası kullanmıyor; pencere görüntüye biniyordu).
*/
async function prepareContext(page: Page) {
  const value = JSON.parse(decodeURIComponent(CONSENT_COOKIE.value)) as Record<string, unknown>;
  await page.context().addCookies([
    { ...CONSENT_COOKIE, value: encodeURIComponent(JSON.stringify({ ...value, t: FIXED_NOW.getTime() - 3_600_000 })) },
  ]);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("cortex-gamification-v1", "1");
    } catch {
      /* depolama kapalıysa pencere çıkar; test bunu görür */
    }
  });
}

/*
  Yerleşim oturana kadar bekle (14 Kasım 2026, katı karşılaştırmada bulundu): üst çubuğun sağındaki öğeler ve profil
  paneli verisi sonradan gelir; gelince menünün ortası yana, panelin satırları ~18 px aşağı kayıyordu ve taban aralıklı
  olarak %0,3–9 farklı çıkıyordu. Üst çubuk, panel ve ana alanın kutuları ile sayfa metninin uzunluğu art arda dört
  ölçümde (200 ms arayla) aynı kalınca çekilir; en çok 10 sn.
*/
async function waitForStableLayout(page: Page) {
  await page
    .waitForFunction(
      () => {
        const w = window as unknown as { __cxSig?: string; __cxSame?: number };
        const boxes = Array.from(document.querySelectorAll("header *, .cx-pp-panel *, main > *"))
          .slice(0, 600)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`;
          })
          .join("|");
        const sig = `${boxes}#${document.body.innerText.length}`;
        w.__cxSame = sig === w.__cxSig ? (w.__cxSame ?? 0) + 1 : 0;
        w.__cxSig = sig;
        return (w.__cxSame ?? 0) >= 4;
      },
      undefined,
      { polling: 200, timeout: 10_000 },
    )
    .catch(() => {
      /* 10 sn'de oturmadıysa yine çekilir; fark eşikte görünür */
    });
}

async function shoot(page: Page, route: Route, url: string, file: string) {
  await prepareContext(page);
  await page.clock.setFixedTime(FIXED_NOW);
  /* Kabuk açılınca `/api/streak` ister; cevapla seri öğesine 🧊 eklenir ve üst çubuk 1 px uzar (alttaki her şey kayar).
     Cevap gelmeden çekilmez (sayfaya özgü hazır koşulu; genel ağ sakinliği değil). */
  let streak = page.waitForResponse((r) => r.url().includes("/api/streak"), { timeout: 30_000 }).catch(() => null);
  let response = await page.goto(url, { timeout: 150_000 });
  /* `next dev` paralel derlemede bazen bir kez 500 verir ("__webpack_modules__[moduleId] is not a function"); yalnız
     bu durumda bir kez yeniden yüklenir. Üretim sunucusunda bu yok; ikinci 500 gerçek hatadır ve test düşer. */
  const streakAgain = () => page.waitForResponse((r) => r.url().includes("/api/streak"), { timeout: 30_000 }).catch(() => null);
  if ((response?.status() ?? 0) >= 500) {
    await page.waitForTimeout(2_000);
    streak = streakAgain();
    response = await page.goto(url, { timeout: 150_000 });
  }
  expect(response?.status() ?? 0, `${url} durum kodu`).toBeLessThan(400);
  /* Ara katman Supabase'e o an ulaşamazsa (ağ aksaklığı) isteği giriş sayfasına gönderir; giriş sayfasında da h1 var,
     taban yanlışlıkla giriş ekranı olurdu. Bir kez yeniden dener; yine girişteyse açıkça düşer. */
  const onLogin = () => new URL(page.url()).pathname.startsWith("/giris");
  if (!url.startsWith("/e2e/") && onLogin()) {
    await page.waitForTimeout(3_000);
    streak = streakAgain();
    await page.goto(url, { timeout: 150_000 });
    expect(onLogin(), `${url}: oturum yok (giriş sayfasına düştü); npm run e2e:login`).toBe(false);
  }
  await page.locator(route.ready ?? H1).first().waitFor({ state: "visible", timeout: 60_000 });
  await streak;
  if (route.open) await route.open(page);
  await page.evaluate(() => document.fonts.ready);
  await waitForStableLayout(page);
  // Next'in geliştirme simgesi (yalnız `next dev`) görüntüye girmesin.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await markDynamic(page);
  await expect(page).toHaveScreenshot(file, {
    mask: [page.locator(MASK_SELECTORS), page.locator("[data-visual-mask]")],
    fullPage: false,
  });
}

const authFor = (user: string) => path.join(AUTH, `${user}.json`);
const missingAuth = (user: string) => !fs.existsSync(authFor(user)) || !STATE.users[user];

// CI'da görsel taban yok: görüntüler Windows'ta, yerelde üretilir (00-taban.md). Dosyadaki her test atlanır.
test.skip(Boolean(process.env.CI), "atlandı: görsel taban yalnızca Windows'ta, yerelde");

function describeUser(user: string, routes: Route[]) {
  test.describe(user, () => {
    test.skip(missingAuth(user), `${user} giriş durumu yok: npm run e2e:seed && npm run e2e:login`);
    test.use({ storageState: missingAuth(user) ? undefined : authFor(user) });
    for (const route of routes) {
      test(route.name, async ({ page }, info) => {
        test.skip(Boolean(route.desktopOnly) && info.project.name === "telefon", route.desktopOnly);
        const ctx = STATE.users[user];
        const url = typeof route.path === "function" ? route.path(ctx) : route.path;
        test.skip(!url, "tohumda bu rota için kayıt yok");
        await shoot(page, route, url!, `${user}/${route.name}.png`);
      });
    }
  });
}

describeUser("e2e-plus", [...ROUTES, PROFILE_PANEL]);
for (const user of PLAN_USERS) {
  describeUser(user, [...ROUTES.filter((r) => PLAN_ROUTES.includes(r.name)), PROFILE_PANEL]);
}

test.describe("kurucu (fikstür)", () => {
  for (const route of FOUNDER_ROUTES) {
    test(route.name, async ({ page }) => {
      await shoot(page, route, route.path as string, `kurucu/${route.name}.png`);
    });
  }
});
