import { expect, test, type Page } from "@playwright/test";

/**
 * Zod `Function("")` yoklaması CSP raporu üretmez (28 Kasım 2026). Üretim derlemesinde (CI) CSP `unsafe-eval`
 * içermez; zod v4 nesne şeması kurarken yoklama yapıyor ve her sayfa açılışında `/api/csp-report`'a
 * `blocked-uri: eval` raporu gidiyordu. `instrumentation-client.ts` zod'u `jitless` başlatır. Geliştirme
 * sunucusunda CSP `unsafe-eval`'a izin verdiği için rapor zaten çıkmaz; asıl ölçüm CI'daki üretim derlemesinde.
 */

async function evalReports(page: Page, path: string, ready: string) {
  const reports: string[] = [];
  page.on("request", (request) => {
    if (!request.url().includes("/api/csp-report")) return;
    const body = request.postData() ?? "";
    if (body.includes('"blocked-uri":"eval"')) reports.push(body);
  });
  await page.goto(path);
  await expect(page.locator(ready).first()).toBeVisible({ timeout: 30_000 });
  // Rapor sayfa açılışında, şemalar kurulurken gidiyordu; şemaları kuran kodun yüklenmesine zaman tanı.
  await page.waitForLoadState("networkidle");
  return reports;
}

test("ders ekranı açılışında eval CSP raporu yok @public", async ({ page }) => {
  expect(await evalReports(page, "/e2e/ders-onsoz", ".als")).toEqual([]);
});

test("ana sayfa açılışında eval CSP raporu yok @public", async ({ page }) => {
  expect(await evalReports(page, "/", "main")).toEqual([]);
});
