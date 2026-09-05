import { describe, expect, it } from "vitest";
import {
  emailDomain,
  isDisposableEmail,
  normalizeEmail,
} from "@/lib/auth/email-policy";

describe("kayıt e-postası kuralları", () => {
  it("aynı Gmail kutusunun farklı yazımlarını tek adrese indirir", () => {
    // Bu üçü tek kutuya düşüyor. Ayrı saymak, bir kutuyla sınırsız hesap
    // açmaya izin vermek demekti.
    const canonical = "aliveli@gmail.com";
    expect(normalizeEmail("ali.veli@gmail.com")).toBe(canonical);
    expect(normalizeEmail("ali.veli+cortex@gmail.com")).toBe(canonical);
    expect(normalizeEmail("A.L.I.V.E.L.I@googlemail.com")).toBe(canonical);
  });

  it("Gmail dışında noktaya dokunmaz", () => {
    // Başka sağlayıcılarda nokta anlamlı: ali.veli ile aliveli farklı kişi.
    expect(normalizeEmail("ali.veli@outlook.com")).toBe("ali.veli@outlook.com");
  });

  it("Gmail dışında da artıdan sonrasını atar", () => {
    expect(normalizeEmail("ali+cortex@outlook.com")).toBe("ali@outlook.com");
  });

  it("bozuk girdide çökmez", () => {
    expect(normalizeEmail("ali")).toBe("ali");
    expect(normalizeEmail("")).toBe("");
    expect(emailDomain("ali")).toBe("");
  });

  it("tek kullanımlık adresi tanır", () => {
    expect(isDisposableEmail("deneme@mailinator.com")).toBe(true);
    expect(isDisposableEmail("deneme@yopmail.com")).toBe(true);
  });

  it("gerçek adresi engellemez", () => {
    expect(isDisposableEmail("ogrenci@gmail.com")).toBe(false);
    expect(isDisposableEmail("ogrenci@lisem.k12.tr")).toBe(false);
  });

  it("verilen listeyi koddaki yedeğin yerine kullanır", () => {
    expect(isDisposableEmail("a@ornek.com", ["ornek.com"])).toBe(true);
    expect(isDisposableEmail("a@mailinator.com", ["ornek.com"])).toBe(false);
  });
});
