import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const actions = readFileSync("src/app/admin/actions.ts", "utf8");
const form = readFileSync("src/components/admin/user-actions.tsx", "utf8");

describe("kullanıcılar sayfasındaki kredi formu", () => {
  it("artı tutarı credit_adjust_balance fonksiyonuna grant türüyle yollar", () => {
    expect(form).toContain("adjustCredits");
    expect(actions).toMatch(
      /p_entry_type:\s*parsed\.data\.delta > 0 \? "grant" : "adjustment"/,
    );
    expect(actions).toContain('rpc("credit_adjust_balance"');
  });
});
