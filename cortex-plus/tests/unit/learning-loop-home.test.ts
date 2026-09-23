import { describe, expect, it } from "vitest";
import { homePathForRole } from "@/lib/parity/signup";
import { CANONICAL_FEATURES } from "@/components/parity/student-shell-nav";

describe("learning loop home + naming", () => {
  it("giriş sonrası ana sayfa dashboard", () => {
    expect(homePathForRole("student")).toBe("/dashboard");
    expect(homePathForRole(null)).toBe("/dashboard");
    expect(homePathForRole("admin")).toBe("/admin");
  });

  it("canonical özellik isimleri sabit", () => {
    expect(CANONICAL_FEATURES.mistakeNotebook).toBe("Yanlışlar Defteri");
    expect(CANONICAL_FEATURES.aiTeacher).toBe("AI Öğretmen");
    expect(CANONICAL_FEATURES.podcast).toBe("Podcast");
  });
});
