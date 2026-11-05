import { describe, expect, it } from "vitest";
import { REINFORCE_TARGET, reinforceNewStep } from "@/lib/content-pool/reinforce-new";

describe("reinforceNewStep", () => {
  it("havuzda 2 soru varsa onları hemen verir ve arka plan üretimi ister", () => {
    expect(reinforceNewStep(2, false)).toEqual({ serveReady: true, more: true });
  });
  it("hedef dolunca ek üretim istemez", () => {
    expect(reinforceNewStep(REINFORCE_TARGET, false)).toEqual({ serveReady: true, more: false });
  });
  it("havuz boşsa ya da fill turuysa üretime gider", () => {
    expect(reinforceNewStep(0, false)).toEqual({ serveReady: false, more: false });
    expect(reinforceNewStep(3, true)).toEqual({ serveReady: false, more: false });
  });
});
