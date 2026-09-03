import { describe, expect, it } from "vitest";
import { createConfettiParticles } from "@/lib/ui/confetti";

describe("createConfettiParticles", () => {
  it("istenen sayıda parçacık üretir", () => {
    expect(createConfettiParticles(50, 100, 100)).toHaveLength(50);
    expect(createConfettiParticles(0, 100, 100)).toHaveLength(0);
  });

  it("hepsi başlangıç noktasından fırlar", () => {
    const particles = createConfettiParticles(10, 42, 84);
    expect(particles.every((p) => p.x === 42 && p.y === 84)).toBe(true);
  });

  it("yukarı doğru fırlar (vy negatif)", () => {
    const particles = createConfettiParticles(30, 0, 0);
    expect(particles.every((p) => p.vy < 0)).toBe(true);
  });

  it("sabit üreteçle deterministik sonuç verir", () => {
    let seed = 0;
    const seq = [0.1, 0.5, 0.9, 0.2, 0.3, 0.4];
    const rand = () => seq[seed++ % seq.length];
    const a = createConfettiParticles(3, 0, 0, { rand });
    seed = 0;
    const b = createConfettiParticles(3, 0, 0, { rand });
    expect(a).toEqual(b);
  });

  it("verilen renk paletinden seçer", () => {
    const colors = ["#111111"];
    const particles = createConfettiParticles(5, 0, 0, { colors });
    expect(particles.every((p) => p.color === "#111111")).toBe(true);
  });
});
