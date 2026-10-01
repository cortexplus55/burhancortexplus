import { describe, expect, it } from "vitest";
import { timeGreeting } from "@/lib/ui/greeting";

function at(hour: number): Date {
  const d = new Date(2026, 0, 1, hour, 0, 0);
  return d;
}

describe("timeGreeting", () => {
  it("gece yarısından sabah 6'ya kadar İyi geceler der", () => {
    expect(timeGreeting(at(0))).toBe("İyi geceler");
    expect(timeGreeting(at(5))).toBe("İyi geceler");
  });

  it("06-11 arası Günaydın der", () => {
    expect(timeGreeting(at(6))).toBe("Günaydın");
    expect(timeGreeting(at(10))).toBe("Günaydın");
  });

  it("11-18 arası İyi günler der", () => {
    expect(timeGreeting(at(11))).toBe("İyi günler");
    expect(timeGreeting(at(17))).toBe("İyi günler");
  });

  it("18-22 arası İyi akşamlar der", () => {
    expect(timeGreeting(at(18))).toBe("İyi akşamlar");
    expect(timeGreeting(at(21))).toBe("İyi akşamlar");
  });

  it("22'den gece yarısına İyi geceler der", () => {
    expect(timeGreeting(at(22))).toBe("İyi geceler");
    expect(timeGreeting(at(23))).toBe("İyi geceler");
  });
});

describe("parityTimeGreeting (ana sayfa, sunucuda)", () => {
  it("sunucu UTC'de çalışsa da Türkiye saatine göre selamlar", async () => {
    const { parityTimeGreeting } = await import("@/components/parity/app-utils");
    // 04:40 UTC = 07:40 TRT — canlıda "iyi geceler" yazıyordu.
    expect(parityTimeGreeting(new Date("2026-09-30T04:40:00Z"))).toBe("Günaydın");
    expect(parityTimeGreeting(new Date("2026-09-30T20:30:00Z"))).toBe("İyi geceler");
    expect(parityTimeGreeting(new Date("2026-09-30T12:00:00Z"))).toBe("İyi günler");
  });
});
