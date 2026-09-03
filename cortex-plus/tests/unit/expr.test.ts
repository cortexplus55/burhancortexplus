import { describe, expect, it } from "vitest";
import { compile, derivative, integrate } from "@/lib/lab/expr";

/**
 * Bu ayrıştırıcı öğrencinin yazdığı metni işliyor ve sonuç paylaşılabilir
 * bir bağlantıya girebiliyor. `eval` kullanılmadığının ve bilinmeyen adların
 * reddedildiğinin testle sabitlenmesi güvenlik açısından önemli.
 */

const at = (src: string, x: number) => {
  const f = compile(src);
  expect(f).not.toBeNull();
  return f!(x);
};

describe("compile", () => {
  it("dört işlemi öncelik sırasıyla hesaplar", () => {
    expect(at("2+3*4", 0)).toBe(14);
    expect(at("(2+3)*4", 0)).toBe(20);
    expect(at("10/4", 0)).toBe(2.5);
  });

  it("üs sağdan birleşir", () => {
    expect(at("2^3^2", 0)).toBe(512);
  });

  it("değişkeni yerine koyar", () => {
    expect(at("x^2", 5)).toBe(25);
    expect(at("3*x+1", 2)).toBe(7);
  });

  it("örtük çarpımı anlar", () => {
    expect(at("2x", 4)).toBe(8);
    expect(at("(x+1)(x-1)", 3)).toBe(8);
    expect(at("2(x+1)", 3)).toBe(8);
  });

  it("tekil eksiyi anlar", () => {
    expect(at("-x", 5)).toBe(-5);
    expect(at("-2^2", 0)).toBe(-4);
    expect(at("3*-2", 0)).toBe(-6);
  });

  it("fonksiyon ve sabitleri tanır", () => {
    expect(at("sin(0)", 0)).toBe(0);
    expect(at("cos(pi)", 0)).toBeCloseTo(-1, 10);
    expect(at("sqrt(16)", 0)).toBe(4);
    expect(at("ln(e)", 0)).toBeCloseTo(1, 10);
  });

  it("boşluk ve virgüllü ondalığı kabul eder", () => {
    expect(at(" 1,5 * x ", 2)).toBe(3);
  });

  /** Güvenlik: bilinmeyen ad çalıştırılmaz, reddedilir. */
  it("bilinmeyen adı ve bozuk ifadeyi reddeder", () => {
    expect(compile("alert(1)")).toBeNull();
    expect(compile("window")).toBeNull();
    expect(compile("x+")).toBeNull();
    expect(compile("(x")).toBeNull();
    expect(compile("x)")).toBeNull();
    expect(compile("")).toBeNull();
    expect(compile("2 $ 3")).toBeNull();
  });
});

describe("derivative", () => {
  it("birinci türevi yaklaşık verir", () => {
    const f = compile("x^2")!;
    expect(derivative(f, 3)).toBeCloseTo(6, 4);
    const g = compile("sin(x)")!;
    expect(derivative(g, 0)).toBeCloseTo(1, 4);
  });

  it("ikinci türevi yaklaşık verir", () => {
    const f = compile("x^3")!;
    // (x³)'' = 6x
    expect(derivative(f, 2, 2)).toBeCloseTo(12, 2);
  });
});

describe("integrate", () => {
  it("polinomu tam hesaplar", () => {
    // ∫₀¹ x² dx = 1/3
    expect(integrate(compile("x^2")!, 0, 1)).toBeCloseTo(1 / 3, 8);
  });

  it("trigonometrik integrali hesaplar", () => {
    // ∫₀^π sin(x) dx = 2
    expect(integrate(compile("sin(x)")!, 0, Math.PI)).toBeCloseTo(2, 6);
  });

  it("ters sınırda işaret değiştirir", () => {
    expect(integrate(compile("x")!, 1, 0)).toBeCloseTo(-0.5, 8);
  });
});
