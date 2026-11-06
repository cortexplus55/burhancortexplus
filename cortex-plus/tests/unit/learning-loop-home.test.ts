import { describe, expect, it } from "vitest";
import { homePathForRole } from "@/lib/parity/signup";
import { CANONICAL_FEATURES } from "@/components/parity/student-shell-nav";

describe("learning loop home + naming", () => {
  // 6 Kasım 2026: ev doğrudan /ogretmen (eski /dashboard yalnız oraya yönlenen rota).
  it("giriş sonrası ana sayfa ogretmen", () => {
    expect(homePathForRole("student")).toBe("/ogretmen");
    expect(homePathForRole(null)).toBe("/ogretmen");
    expect(homePathForRole("admin")).toBe("/admin");
  });

  it("canonical özellik isimleri sabit", () => {
    expect(CANONICAL_FEATURES.mistakeNotebook).toBe("Yanlışlar Defteri");
    expect(CANONICAL_FEATURES.aiTeacher).toBe("AI Öğretmen");
    expect(CANONICAL_FEATURES.podcast).toBe("Podcast");
  });
});
