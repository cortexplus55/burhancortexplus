import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const css = readFileSync(path.join(process.cwd(), "src/styles/oral-exam-chrome.css"), "utf8");
const fixture = JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/oral-fact-fixture.json"), "utf8")) as {
  questions: { wrong?: boolean }[];
};

function pageHtml(body: string) {
  return `<!doctype html><html><head><style>${css}</style></head><body>${body}</body></html>`;
}

test.describe("kapalı katman tıklamayı tutmaz", () => {
  test("sözlü fixture üç soru ve tek yanlış olgu taşır", () => {
    expect(fixture.questions).toHaveLength(3);
    expect(fixture.questions.filter((question) => question.wrong).length).toBe(1);
  });

  test("açık diyalog arkadaki düğmeyi tutar, kapanınca tutmaz", async ({ page }) => {
    await page.setContent(
      pageHtml(`
        <button type="button" id="go">Devam et</button>
        <div class="cp-oral-modal-back">
          <div role="dialog">Açık katman</div>
        </div>
      `),
    );
    await expect(page.getByRole("button", { name: "Devam et" }).click({ timeout: 400 })).rejects.toThrow();

    await page.setContent(
      pageHtml(`
        <button type="button" id="go">Devam et</button>
        <div class="cp-oral-modal-back" aria-hidden="true"></div>
      `),
    );
    const started = Date.now();
    await page.getByRole("button", { name: "Devam et" }).click({ timeout: 1000 });
    expect(Date.now() - started).toBeLessThan(300);

    await page.setContent(
      pageHtml(`
        <button type="button" id="go">Devam et</button>
        <div class="cp-oral-modal-back"></div>
      `),
    );
    let clicks = 0;
    await page.exposeFunction("markClick", () => {
      clicks += 1;
    });
    await page.evaluate(() => {
      document.getElementById("go")?.addEventListener("click", () => {
        (window as unknown as { markClick: () => void }).markClick();
      });
    });
    const again = Date.now();
    await page.getByRole("button", { name: "Devam et" }).click({ timeout: 1000 });
    expect(Date.now() - again).toBeLessThan(300);
    expect(clicks).toBe(1);
  });
});
