import path from "node:path";
import { expect, test } from "@playwright/test";

test("kapalı katman Devam et tıklamasını yutmaz", async ({ page }) => {
  await page.setContent(`<!doctype html>
    <html><body>
      <button id="go" type="button">Devam et</button>
      <div class="cp-oral-modal-back" hidden></div>
      <div class="cp-oral-modal-back is-closed"></div>
      <div class="cp-oral-modal-back" aria-hidden="true"></div>
    </body></html>`);
  await page.addStyleTag({ path: path.join(process.cwd(), "src/styles/oral-exam-chrome.css") });
  const hit = await page.evaluate(() => {
    const button = document.getElementById("go");
    if (!button) return "";
    const rect = button.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return top instanceof HTMLElement ? top.id : "";
  });
  expect(hit).toBe("go");
  await page.evaluate(() => {
    document.getElementById("go")?.addEventListener("click", () => {
      document.body.dataset.clicked = "1";
    });
  });
  await page.getByRole("button", { name: "Devam et" }).click({ timeout: 1_000 });
  await expect.poll(async () => page.evaluate(() => document.body.dataset.clicked)).toBe("1");
});
