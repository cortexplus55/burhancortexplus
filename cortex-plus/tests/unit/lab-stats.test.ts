import { describe, expect, it } from "vitest";
import {
  displayRating,
  formatPlays,
  toStatMap,
  topPlayed,
  type LabStatMap,
} from "@/lib/parity/lab-stats";

describe("toStatMap", () => {
  it("RPC satırlarını haritaya çevirir", () => {
    const map = toStatMap([
      { app_id: "gunes", plays: "12", rating_avg: "4.5", rating_count: "4" },
    ]);
    expect(map.gunes).toEqual({
      app_id: "gunes",
      plays: 12,
      rating_avg: 4.5,
      rating_count: 4,
    });
  });

  it("boş/bozuk girdide çökmez", () => {
    expect(toStatMap(null)).toEqual({});
    expect(toStatMap([{ plays: 5 }])).toEqual({});
  });

  it("puan yokken null bırakır", () => {
    const map = toStatMap([{ app_id: "x", plays: 3, rating_avg: null, rating_count: 0 }]);
    expect(map.x!.rating_avg).toBeNull();
  });
});

describe("formatPlays", () => {
  it("bini aşınca kısaltır", () => {
    expect(formatPlays(950)).toBe("950");
    expect(formatPlays(1200)).toBe("1,2k");
    expect(formatPlays(44000)).toBe("44k");
    expect(formatPlays(1_500_000)).toBe("1,5M");
  });
});

describe("topPlayed", () => {
  const apps = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const stats: LabStatMap = {
    a: { app_id: "a", plays: 5, rating_avg: null, rating_count: 0 },
    b: { app_id: "b", plays: 20, rating_avg: null, rating_count: 0 },
  };

  it("gerçek oynanmaya göre sıralar", () => {
    expect(topPlayed(apps, stats).map((r) => r.id)).toEqual(["b", "a"]);
  });

  // Sahte sosyal kanıt göstermemek için hiç oynanmamışlar listeye girmez.
  it("hiç oynanmamış uygulamayı listeye almaz", () => {
    expect(topPlayed(apps, stats).some((r) => r.id === "c")).toBe(false);
  });

  it("hiç veri yoksa boş döner", () => {
    expect(topPlayed(apps, {})).toEqual([]);
  });
});

describe("displayRating", () => {
  it("yeterli oy varsa puanı gösterir", () => {
    expect(
      displayRating({ app_id: "a", plays: 9, rating_avg: 4.5, rating_count: 4 }),
    ).toBe("4,5");
  });

  // Tek oyla "5,0" göstermek yanıltıcı olurdu.
  it("oy sayısı azken puan göstermez", () => {
    expect(
      displayRating({ app_id: "a", plays: 9, rating_avg: 5, rating_count: 1 }),
    ).toBeNull();
  });

  it("veri yoksa null", () => {
    expect(displayRating(undefined)).toBeNull();
  });
});
