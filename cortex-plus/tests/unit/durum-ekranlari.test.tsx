// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/*
  Faz 12A: 404, sayfa hatası ve kök hata ekranı. Gerçek logo, istenen metinler, tek brand eylem; teknik ayrıntı yok
  (yalnız kısa hata kodu); altın ve üç boyutlu "404" çizimi yok.
*/

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
afterEach(cleanup);

import NotFound from "@/app/not-found";
import RouteError from "@/app/error";
import GlobalError from "@/app/global-error";

describe("404", () => {
  it("başlık, açıklama, tek brand eylem; logo gerçek dosya; 404 çizimi yok", () => {
    const { container } = render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Sayfa bulunamadı");
    expect(container.textContent).toContain("Aradığın sayfa taşınmış ya da silinmiş olabilir.");
    const brands = container.querySelectorAll(".cx-status-brand");
    expect(brands).toHaveLength(1);
    expect(brands[0].textContent).toBe("Ana sayfaya dön");
    expect(brands[0].getAttribute("href")).toBe("/");
    expect(container.querySelector('img[src="/logo-mark-trim.png"]')).toBeTruthy();
    expect(container.textContent).not.toContain("404");
  });
});

describe("sayfa hatası", () => {
  it("metinler, Yeniden dene reset'i çağırır, zayıf Ana sayfaya dön; yalnız hata kodu, mesaj ve yığın yok", () => {
    const reset = vi.fn();
    const error = Object.assign(new Error("gizli teknik ayrıntı"), { digest: "abc123" });
    const { container } = render(<RouteError error={error} reset={reset} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Bir şeyler ters gitti");
    expect(container.textContent).toContain("Sorun bizde. Sayfayı yenilemeyi dene; sürerse biraz sonra tekrar bak.");
    fireEvent.click(screen.getByRole("button", { name: "Yeniden dene" }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Ana sayfaya dön" }).className).toBe("cx-status-weak");
    expect(container.textContent).toContain("Hata kodu: abc123");
    expect(container.textContent).not.toContain("gizli teknik ayrıntı");
    expect(container.querySelectorAll(".cx-status-brand")).toHaveLength(1);
  });
});

describe("kök hata", () => {
  it("kendi html lang=tr; metinler; altın yok; hata mesajı yok", () => {
    const source = readFileSync("src/app/global-error.tsx", "utf8");
    expect(source).toContain('<html lang="tr">');
    expect(source).toContain("Bir şeyler ters gitti");
    expect(source).toContain("Sorun bizde. Sayfayı yenilemeyi dene; sürerse biraz sonra tekrar bak.");
    expect(source).toContain("Yeniden dene");
    expect(source).toContain("Ana sayfaya dön");
    expect(source).not.toMatch(/#e8a838/i);
    expect(source).not.toContain("error.message");
    // Bileşen kendi html'ini çizer; sunucu çizimiyle metni doğrula (hook'lar sunucuda koşmaz).
    expect(typeof GlobalError).toBe("function");
    expect(source).toContain("Hata kodu: {error.digest}");
  });

  it("eski 404 stil dosyası ve 3B çizim sınıfı kalmadı", () => {
    expect(() => readFileSync("src/styles/not-found.css", "utf8")).toThrow();
    expect(readFileSync("src/app/not-found.tsx", "utf8")).not.toContain("Icon3D");
  });
});
