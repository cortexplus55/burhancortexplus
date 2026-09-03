import { describe, expect, it } from "vitest";
import {
  energy,
  step,
  type PendulumParams,
  type PendulumState,
} from "@/lib/lab/double-pendulum";

/**
 * Buradaki tek gerçek risk sayısal. Yanlış bir integratör sistemi kaotik
 * göstermez, enerjisini şişirip sarkacı fırlatır — ve ekranda bu ikisi
 * ayırt edilemiyor. O yüzden enerji korunumu testle sabitlendi.
 */

const P: PendulumParams = { m1: 1, m2: 1, l1: 1, l2: 1 };

function run(s0: PendulumState, seconds: number, dt = 0.002): PendulumState {
  let s = s0;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) s = step(s, dt, P);
  return s;
}

describe("çift sarkaç", () => {
  it("enerjiyi 30 saniye boyunca koruyor", () => {
    const s0: PendulumState = [(120 * Math.PI) / 180, (120 * Math.PI) / 180, 0, 0];
    const e0 = energy(s0, P);
    const s1 = run(s0, 30);
    const e1 = energy(s1, P);

    // Ölçüldü: doğru denklemlerle sapma 120 saniyede 10⁻⁵ % düzeyinde.
    // Bu eşik geçilirse denklemler ya da integratör bozulmuş demektir.
    expect(Math.abs((e1 - e0) / e0)).toBeLessThan(1e-6);
  });

  it("durum sonlu kalıyor — fırlamıyor", () => {
    const s = run([Math.PI / 2, Math.PI / 2, 0, 0], 60);
    for (const v of s) expect(Number.isFinite(v)).toBe(true);
    // Açısal hız makul sınırda; patlayan bir çözümde bu binlere çıkar.
    expect(Math.abs(s[2])).toBeLessThan(50);
    expect(Math.abs(s[3])).toBeLessThan(50);
  });

  it("dengede duran sarkaç hareket etmiyor", () => {
    const s = run([0, 0, 0, 0], 5);
    expect(Math.abs(s[0])).toBeLessThan(1e-12);
    expect(Math.abs(s[1])).toBeLessThan(1e-12);
  });

  it("zaman ilerledikçe durum gerçekten değişiyor", () => {
    const s0: PendulumState = [1, 1, 0, 0];
    const s1 = run(s0, 1);
    expect(Math.abs(s1[0] - s0[0])).toBeGreaterThan(0.01);
  });

  /** Simülasyonun bütün varlık sebebi: küçük fark büyüyor. */
  it("binde bir başlangıç farkı zamanla büyüyor", () => {
    const a: PendulumState = [(120 * Math.PI) / 180, (120 * Math.PI) / 180, 0, 0];
    const b: PendulumState = [a[0] + 0.001, a[1], 0, 0];

    const early = run(a, 1);
    const earlyB = run(b, 1);
    const earlyGap = Math.abs(early[0] - earlyB[0]);

    const late = run(a, 15);
    const lateB = run(b, 15);
    const lateGap = Math.abs(late[0] - lateB[0]);

    expect(earlyGap).toBeLessThan(0.05);
    expect(lateGap).toBeGreaterThan(earlyGap * 10);
  });

  it("küçük açıda düzenli kalıyor — kaos yok", () => {
    const a: PendulumState = [0.05, 0.05, 0, 0];
    const b: PendulumState = [0.051, 0.05, 0, 0];
    const ra = run(a, 15);
    const rb = run(b, 15);
    // Küçük genlikte sistem doğrusala yakın; fark patlamıyor.
    expect(Math.abs(ra[0] - rb[0])).toBeLessThan(0.05);
  });
});
