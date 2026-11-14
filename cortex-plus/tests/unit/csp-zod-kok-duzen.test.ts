import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ageProblem } from "@/lib/legal/consent-age";
import { ageProblem as reexported } from "@/lib/legal/consent-evidence";

/*
  CSP rapor gürültüsü (15 Kasım 2026): kök düzendeki onay kapısı `ageProblem` için `consent-evidence.ts`'i içe
  aktarınca zod şemaları her sayfanın paketine giriyordu; zod 4 nesne şemasında `Function("")` yoklaması yapıyor ve
  rapor kipindeki CSP her sayfa açılışında `/api/csp-report`'a "eval" raporu gönderiyordu (canlıda 5 sayfanın 5'i,
  düzeltmeli üretim derlemesinde 0). Davranış aynı: aynı işlev, aynı cümleler.
*/
const read = (path: string) => readFileSync(path, "utf8");

describe("kök düzende zod yok", () => {
  it("onay kapısı consent-evidence'tan yalnız tür alır; ageProblem zod'suz modülden", () => {
    const gate = read("src/components/legal/consent-gate.tsx");
    expect(gate).toContain('import type { ConsentEvidence, ConsentStatus, MissingConsent } from "@/lib/legal/consent-evidence";');
    expect(gate).not.toMatch(/import \{[^}]*\} from "@\/lib\/legal\/consent-evidence"/);
    expect(read("src/lib/legal/consent-age.ts")).not.toMatch(/from "zod"/);
  });

  it("kayıt sihirbazı da aynı (kayıt sayfasında da rapor yok)", () => {
    expect(read("src/app/kayit/signup-wizard.tsx")).not.toMatch(/import \{[^}]*ageProblem[^}]*\} from "@\/lib\/legal\/consent-evidence"/);
  });

  it("davranış aynı: aynı işlev yeniden dışa veriliyor, cümleler değişmedi", () => {
    expect(reexported).toBe(ageProblem);
    expect(ageProblem(null)).toBe("Yaşını seç.");
    expect(ageProblem({ minor: true, guardianAck: false })).toBe("18 yaşından küçüksen velinin iznini onayla.");
    expect(ageProblem({ minor: true, guardianAck: true })).toBeNull();
    expect(ageProblem({ minor: false, guardianAck: false })).toBeNull();
  });
});
