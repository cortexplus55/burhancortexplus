import { describe, expect, it } from "vitest";
import {
  speechRoundTrip,
  splitDisplaySpoken,
  toDisplay,
} from "@/lib/learning/speech-normalizer";

const CASES: { source: string; display: string; spoken: RegExp; key: string }[] = [
  { source: "6,02 × 10²³", display: "6,02 × 10²³", spoken: /altı virgül sıfır iki çarpı on üzeri yirmi üç/, key: "sci:6.02e23" },
  { source: "6,02 × 10^23", display: "6,02 × 10²³", spoken: /on üzeri yirmi üç/, key: "sci:6.02e23" },
  { source: "10⁻¹⁹", display: "10⁻¹⁹", spoken: /on üzeri eksi on dokuz/, key: "pow:10^-19" },
  { source: "10^-19", display: "10⁻¹⁹", spoken: /eksi on dokuz/, key: "pow:10^-19" },
  { source: "10²³", display: "10²³", spoken: /on üzeri yirmi üç/, key: "pow:10^23" },
  { source: "10 kare küp", display: "10²³", spoken: /on üzeri yirmi üç/, key: "pow:10^23" },
  { source: "x²", display: "x²", spoken: /^x kare$/, key: "pow:x^2" },
  { source: "x³", display: "x³", spoken: /^x küp$/, key: "pow:x^3" },
  { source: "2ⁿ", display: "2ⁿ", spoken: /iki üzeri n/, key: "pow:2^n" },
  { source: "e^x", display: "eˣ", spoken: /e üzeri x/, key: "pow:e^x" },
  { source: "CO₂", display: "CO₂", spoken: /C O iki/, key: "formula:CO2" },
  { source: "CO2", display: "CO₂", spoken: /C O iki/, key: "formula:CO2" },
  { source: "C O iki", display: "CO₂", spoken: /C O iki/, key: "formula:CO2" },
  { source: "H₂SO₄", display: "H₂SO₄", spoken: /H iki S O dört/, key: "formula:H2SO4" },
  { source: "H2SO4", display: "H₂SO₄", spoken: /H iki S O dört/, key: "formula:H2SO4" },
  { source: "H iki S O dört", display: "H₂SO₄", spoken: /H iki S O dört/, key: "formula:H2SO4" },
  { source: "H2O", display: "H₂O", spoken: /H iki O/, key: "formula:H2O" },
  { source: "Fe³⁺", display: "Fe³⁺", spoken: /Fe üç artı/, key: "formula:Fe3+" },
  { source: "Fe3+", display: "Fe³⁺", spoken: /Fe üç artı/, key: "formula:Fe3+" },
  { source: "SO₄²⁻", display: "SO₄²⁻", spoken: /S O dört iki eksi/, key: "formula:SO42-" },
  { source: "SO42-", display: "SO₄²⁻", spoken: /S O dört iki eksi/, key: "formula:SO42-" },
  { source: "g/mol", display: "g/mol", spoken: /gram bölü mol/, key: "unit:g/mol" },
  { source: "kJ/mol", display: "kJ/mol", spoken: /kilojul bölü mol/, key: "unit:kJ/mol" },
  { source: "m/s²", display: "m/s²", spoken: /metre bölü saniye kare/, key: "unit:m/s^2" },
  { source: "25 °C", display: "25 °C", spoken: /santigrat derece/, key: "unit:C" },
  { source: "25%", display: "25%", spoken: /yüzde yirmi beş/, key: "pct:25" },
  { source: "%8", display: "%8", spoken: /yüzde sekiz/, key: "pct:8" },
  { source: "√2", display: "√2", spoken: /karekök iki/, key: "sqrt:2" },
  { source: "√x", display: "√x", spoken: /karekök x/, key: "sqrt:x" },
  { source: "1/2", display: "1/2", spoken: /bir bölü iki/, key: "frac:1/2" },
  { source: "n = m/M", display: "n = m/M", spoken: /n eşittir m bölü M/, key: "frac:m/M" },
  { source: "0,5 mol", display: "0,5 mol", spoken: /sıfır virgül beş/, key: "dec:0.5" },
  { source: "0.5 mol", display: "0,5 mol", spoken: /sıfır virgül beş/, key: "dec:0.5" },
  { source: "5-10", display: "5-10", spoken: /beş ile on arası/, key: "range:5-10" },
  { source: "1914–1918", display: "1914–1918", spoken: /bin dokuz yüz on dört ile bin dokuz yüz on sekiz arası/, key: "range:1914-1918" },
  { source: "1789 yılında", display: "1789 yılında", spoken: /bin yedi yüz seksen dokuz yılında/, key: "year:1789" },
  { source: "XIX. yüzyıl", display: "XIX. yüzyıl", spoken: /on dokuzuncu yüzyıl/, key: "roman:19" },
  { source: "II. Dünya Savaşı", display: "II. Dünya Savaşı", spoken: /ikinci Dünya/, key: "roman:2" },
  { source: "Madde 5/1-a", display: "Madde 5/1-a", spoken: /madde beş, fıkra bir, bent a/, key: "law:5/1-a" },
  { source: "A → B", display: "A → B", spoken: /A ok B/, key: "arrow:to" },
];

describe("speech normalizer", () => {
  it.each(CASES)("$source okunur ve aynı değere döner", ({ source, display, spoken, key }) => {
    const trip = speechRoundTrip(source);
    expect(trip.display).toBe(display);
    expect(trip.spoken).toMatch(spoken);
    expect(trip.spoken).not.toMatch(/kare küp/);
    expect(trip.ok, `${trip.spoken} beklenen ${trip.expected.join(",")} duyulan ${trip.heard.join(",")}`).toBe(true);
    expect(trip.expected).toContain(key);
    expect(trip.heard).toContain(key);
  });

  it("değişkenin karesini kare, sayının üssünü üzeri diye ayırır", () => {
    expect(speechRoundTrip("x²").spoken).toBe("x kare");
    expect(speechRoundTrip("10²").spoken).toBe("on üzeri iki");
    expect(speechRoundTrip("10²").spoken).not.toMatch(/kare/);
  });

  it("eski kayıttan ekran simgesini kurar, ses metnini olduğu gibi bırakır", () => {
    const line = splitDisplaySpoken("Mol, 6,02 × 10 kare küp tanecik ve C O iki.");
    expect(line.text).toContain("10²³");
    expect(line.text).toContain("CO₂");
    expect(line.text).not.toMatch(/kare küp/);
    expect(line.spoken).toContain("10 kare küp");
    expect(line.spoken).toContain("C O iki");
  });

  it("yeni satırda spoken alanı sese gider, ekran simgede kalır", () => {
    const line = splitDisplaySpoken("CO₂ ve 10²³", "C O iki ve on üzeri yirmi üç");
    expect(line.text).toContain("CO₂");
    expect(line.text).toContain("10²³");
    expect(line.spoken).toBe("C O iki ve on üzeri yirmi üç");
  });

  it("9. sınıf sıra sayısını ondalığa çevirmez", () => {
    expect(toDisplay("9. sınıf")).toBe("9. sınıf");
  });
});
