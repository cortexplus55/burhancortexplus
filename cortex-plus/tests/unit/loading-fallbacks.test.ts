import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `loading.tsx` dosyaları React'in Suspense yedeği oluyor ve anında
 * çizilmeleri gerekiyor. Yedek kendi içinde beklemeye girerse React onu
 * içerikle değiştiremiyor: iskelet ile asıl sayfa aynı anda ekranda kalıyor,
 * bazı sayfalarda asıl içerik hiç görünmüyor.
 *
 * Bu yayında gerçekten oldu — beş sayfada birden. Yedekler `AppShell`
 * çiziyordu, o da oturum ve profil sorgusu yapan `async` bir bileşen.
 */
function loadingFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) loadingFiles(path, out);
    else if (entry === "loading.tsx") out.push(path);
  }
  return out;
}

const files = loadingFiles("src/app");

describe("loading.tsx yedekleri", () => {
  it("en az bir tane var", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s eşzamanlı", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/export default async function/);
    expect(source).not.toMatch(/\bawait\b/);
  });

  it.each(files)("%s veri okuyan kabuk çizmiyor", (file) => {
    const source = readFileSync(file, "utf8");
    // AppShell oturum ve profil sorgusu yapıyor; yedekte kullanılamaz.
    expect(source).not.toMatch(/AppShell/);
    expect(source).not.toMatch(/createClient|createServiceClient|requireUser|requireStudentArea/);
  });
});
