import { describe, expect, it, vi } from "vitest";
import {
  onGenerationSucceeded,
  requestAccountRefresh,
  spendableCredits,
  ACCOUNT_REFRESH_EVENT,
} from "@/lib/credits/spendable";

describe("spendable credits", () => {
  it("çip bakiyeyi ve dönem hakkını birlikte gösterir", () => {
    expect(spendableCredits({ balance: 8, freeAllowanceRemaining: 40 })).toBe(48);
    expect(spendableCredits({ balance: 8, freeAllowanceRemaining: 0 })).toBe(8);
    expect(spendableCredits({ balance: 0, freeAllowanceRemaining: 3 })).toBe(3);
  });

  it("başarılı üretimde yenilemeyi çağırır", () => {
    const refresh = vi.fn();
    onGenerationSucceeded(refresh);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("tarayıcı yokken yenileme olayı sessiz kalır", () => {
    expect(() => requestAccountRefresh()).not.toThrow();
    expect(ACCOUNT_REFRESH_EVENT).toBe("cp-account-refresh");
  });
});
