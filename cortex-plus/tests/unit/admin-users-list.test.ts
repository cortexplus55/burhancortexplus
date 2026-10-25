import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ADMIN_USER_PAGE_SIZE,
  adminUsersHref,
  parseAdminPage,
  parseAdminPlanFilter,
  subscriptionPlanKind,
} from "@/lib/admin/user-list";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("yönetici kullanıcı listesi", () => {
  it("arama, paket süzgeci ve sayfa parametrelerini tanır", () => {
    expect(parseAdminPlanFilter("plus")).toBe("plus");
    expect(parseAdminPlanFilter("sigma")).toBe("sigma");
    expect(parseAdminPlanFilter("free")).toBe("free");
    expect(parseAdminPlanFilter("admin")).toBeNull();
    expect(parseAdminPage("3")).toBe(3);
    expect(parseAdminPage("0")).toBe(1);
    expect(parseAdminPage("x")).toBe(1);
    expect(ADMIN_USER_PAGE_SIZE).toBe(50);
    expect(adminUsersHref({ q: "ali", plan: "plus", page: 2 })).toBe(
      "/admin/kullanicilar?q=ali&plan=plus&page=2",
    );
    expect(subscriptionPlanKind({ tier: "sigma", slug: "sigma-aylik" })).toBe("sigma");
    expect(subscriptionPlanKind({ tier: "plus", slug: "plus-haftalik" })).toBe("plus");
  });

  it("sayfa arama, süzgeç ve sayfalama çiziyor", () => {
    const page = read("src/app/admin/kullanicilar/page.tsx");
    expect(page).toContain("parseAdminPlanFilter");
    expect(page).toContain("parseAdminPage");
    expect(page).toContain('name="plan"');
    expect(page).toContain("Ücretsiz");
    expect(page).toContain("Plus");
    expect(page).toContain("Sigma");
    expect(page).toContain(".range(from, to)");
    expect(page).toContain("{ count: \"exact\" }");
    expect(page).toContain("AdminUsersPager");
    expect(page).toContain("Önceki");
    expect(page).toContain("Sonraki");
  });
});
