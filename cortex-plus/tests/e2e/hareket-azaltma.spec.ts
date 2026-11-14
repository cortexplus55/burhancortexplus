import { expect, test } from "@playwright/test";

/*
  Faz 12A (14 Kasım 2026): hareket azaltma açıkken boşta sonsuz animasyon yok (yalnız opaklık serbest). Herkese açık
  rotalar ve veritabanısız fikstürler; logo parıltısı ve akışı da durur.
*/

const ROUTES = [
  "/",
  "/giris",
  "/kayit",
  "/fiyatlandirma",
  "/bu-sayfa-yok",
  "/e2e/ana-ekran?hazirlik=1",
  "/e2e/ana-ekran",
  "/e2e/studyo",
  "/e2e/sihirbaz?adim=material",
  "/e2e/paketler",
  "/e2e/ders-mobil",
  "/e2e/profil",
];

for (const route of ROUTES) {
  test(`hareket azaltma: ${route} boşta sonsuz animasyon yok`, { tag: ["@public"] }, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => window.localStorage.setItem("cortex-gamification-v1", "1"));
    await page.goto(route);
    await page.waitForLoadState("load");
    await page.waitForTimeout(600);
    const offenders = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((animation) => animation.playState === "running")
        .filter((animation) => {
          const timing = animation.effect?.getComputedTiming();
          return timing?.iterations === Infinity;
        })
        .filter((animation) => {
          const effect = animation.effect as KeyframeEffect | null;
          const keyframes = effect?.getKeyframes?.() ?? [];
          const props = new Set(keyframes.flatMap((frame) => Object.keys(frame).filter((key) => !["offset", "easing", "composite", "computedOffset"].includes(key))));
          return [...props].some((prop) => prop !== "opacity");
        })
        .map((animation) => {
          const target = (animation.effect as KeyframeEffect | null)?.target as Element | null;
          const name = (animation as CSSAnimation).animationName ?? "";
          return `${name} @ ${target?.tagName.toLowerCase() ?? "?"}.${String(target?.className ?? "").split(" ").slice(0, 2).join(".")}`;
        }),
    );
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
}
