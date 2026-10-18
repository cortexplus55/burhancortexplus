import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
  Hesabı askıya alma (18 Ekim 2026, plan 4.1). Tek kapı kuralı: askı, silinmiş hesap
  bariyeriyle aynı fonksiyondan geçer; böylece ara katman ve bütün tabloların kısıtlayıcı
  ilkesi otomatik kapanır. Bu bekçi kapının iki yerde birden açık kalmasını önler.
*/
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("hesap askıya alma", () => {
  it("göç: sütun eklenir, bariyer fonksiyonu askıyı da sayar, durum fonksiyonu nedeni söyler; DROP yok", () => {
    const sql = read("supabase/migrations/20261018170000_account_suspension.sql");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS suspended_at timestamptz");
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.current_account_active\(\)[\s\S]*suspended_at IS NOT NULL/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.current_account_status\(\)[\s\S]*'suspended'/);
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.current_account_status() FROM PUBLIC, anon");
    // Yorum satırları sayılmaz; SQL gövdesinde yıkıcı komut olmamalı.
    const body = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(body).not.toMatch(/\bDROP\b/);
  });

  it("ara katman askıdaki hesabı girişe nedeniyle gönderir", () => {
    const mw = read("src/lib/supabase/middleware.ts");
    expect(mw).toContain('supabase.rpc("current_account_status")');
    expect(mw).toContain('"?durum=askida"');
  });

  it("giriş sayfası askı notunu gösterir, yönetici satırında düğme ve rozet var, kendi hesabı kapalı", () => {
    expect(read("src/app/giris/giris-inner.tsx")).toContain("askida");
    const actions = read("src/components/admin/user-actions.tsx");
    expect(actions).toContain("Askıya al");
    expect(actions).toContain("Askıyı kaldır");
    expect(actions).toMatch(/disabled=\{pending \|\| isSelf\}/);
    const page = read("src/app/admin/kullanicilar/page.tsx");
    expect(page).toContain("suspended_at");
    expect(page).toContain("Askıda");
    const server = read("src/app/admin/actions.ts");
    expect(server).toContain("export async function setUserSuspended");
    expect(server).toContain("Kendi hesabını askıya alamazsın.");
    expect(server).toContain('ban_duration: suspend ? "876600h" : "none"');
  });
});
