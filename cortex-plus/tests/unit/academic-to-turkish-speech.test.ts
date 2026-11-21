import { describe, expect, it } from "vitest";
import { ordinalWords, verbalizeAcademicTextForTurkishSpeech as speak } from "@/lib/speech/academic-to-turkish-speech";

/*
  Evrensel akademik seslendirme motoru (öğretmen v3, 21 Kasım 2026). Her örnekte hiçbir simge yutulmaz: ses modeline
  giden metinde simge kalmaz, okunuşu yerinde durur. Örnekler matematik, mühendislik/fizik, tıp/kimya ve hukuk/tarihten.
*/

/** Ses modelinin yutabileceği simgeler: çıktıda hiçbiri kalmamalı. */
const SWALLOWED = /[√∛∜×÷·⋅=≠≤≥≈±∞∫∑∂π^_{}\\$|α-ωΑ-Ω⁰-⁹⁺⁻₀-₉°%→↑↓⇌]/u;

function expectSpoken(input: string, expected: string) {
  const out = speak(input);
  expect(out).toBe(expected);
  expect(out).not.toMatch(SWALLOWED);
}

describe("matematik ve kalkülüs", () => {
  it("kök, eşittir ve çarpı tek simge yutulmadan okunur", () => {
    expectSpoken("√45 = √9 × √5", "kök 45 eşittir kök 9 çarpı kök 5");
    expectSpoken("√9'un değeri 3'tür.", "kök 9'un değeri 3'tür.");
    expectSpoken("3√5 ile ∛8 aynı değil.", "3 kök 5 ile küp kök 8 aynı değil.");
  });

  it("LaTeX: kök, küp kök, kesir, üs, çarpı ve Yunan harfi", () => {
    expectSpoken("$\\sqrt{45} = \\sqrt{9} \\times \\sqrt{5}$", "kök 45 eşittir kök 9 çarpı kök 5");
    expectSpoken("$\\sqrt[3]{x}$ ve $\\frac{a}{b}$", "küp kök x ve a bölü b");
    expectSpoken("$x^2 + x^3 = 0$", "x kare artı x küp eşittir 0");
    expectSpoken("$\\frac{\\sqrt{2}}{2} \\approx 0,707$", "kök 2 bölü 2 yaklaşık eşittir 0,707");
    expectSpoken("$\\Delta P = \\rho \\cdot g \\cdot h$", "delta P eşittir ro çarpı g çarpı h");
  });

  it("Unicode işlemler, mutlak değer, eşitsizlik ve özel simgeler", () => {
    expectSpoken("x² + 2x - 3 = 0", "x kare artı 2x eksi 3 eşittir 0");
    expectSpoken("f(x) = |x - 3|", "f(x) eşittir mutlak değer x eksi 3");
    expectSpoken("a ≠ b ve x ≤ 5, y ≥ 2", "a eşit değildir b ve x küçük eşittir 5, y büyük eşittir 2");
    expectSpoken("∫ f(x) dx ≈ π ve ∑ sonsuz değil ∞", "integral f(x) dx yaklaşık eşittir pi ve toplam sonsuz değil sonsuz");
    expectSpoken("∂f kısmi türevi ve 3/4 kesri", "kısmi türev f kısmi türevi ve 3 bölü 4 kesri");
    expectSpoken("Sınav %40 ağırlıklı.", "Sınav yüzde 40 ağırlıklı.");
  });

  it("aralık eksi değildir; tarih bölme değildir", () => {
    expectSpoken("Her gün 2-3 soru çöz.", "Her gün 2-3 soru çöz.");
    expect(speak("Sınav 21/11/2026 tarihinde.")).toBe("Sınav 21/11/2026 tarihinde.");
  });
});

describe("mühendislik, fizik ve birimler", () => {
  it("Yunan harfleri, ohm ve ivme birimi", () => {
    expectSpoken("ΔP = ρ · g · h", "delta P eşittir ro çarpı g çarpı h");
    expectSpoken("Yerçekimi ivmesi 9,8 m/s² alınır.", "Yerçekimi ivmesi 9,8 metre bölü saniye kare alınır.");
    expectSpoken("Direnç 10 Ω olur.", "Direnç 10 ohm olur.");
    expectSpoken("α, β, γ, θ, λ, σ, τ, φ ve ω açıları", "alfa, beta, gama, teta, lambda, sigma, tov, fi ve omega açıları");
  });

  it("birim sözlüğü sayının ardında; Türkçe ek korunur", () => {
    expectSpoken("Yoğunluk 1000 kg/m³, basınç 101 kPa ve 5 kN yük.", "Yoğunluk 1000 kilogram bölü metreküp, basınç 101 kilopaskal ve 5 kilonewton yük.");
    expectSpoken("50 Hz, 2 kW ve 25 °C", "50 hertz, 2 kilovat ve 25 santigrat derece");
    expectSpoken("Açı 30° olur; hız 20 m/s'dir.", "Açı 30 derece olur; hız 20 metre bölü saniye'dir.");
    expectSpoken("Gerilme 200 N/m² ve 3 μg madde", "Gerilme 200 newton bölü metrekare ve 3 mikrogram madde");
  });

  it("kelimenin parçası birim sayılmaz; kelimeler arasındaki orta nokta ayraçtır", () => {
    expect(speak("3 gün sonra 5 metre yürü.")).toBe("3 gün sonra 5 metre yürü.");
    expect(speak("Notunda geçmiyor · genel bilgi")).toBe("Notunda geçmiyor, genel bilgi");
    expect(speak("Hız v = 20 m/s ve t = 4 s ise yol 80 m olur.")).toBe(
      "Hız v eşittir 20 metre bölü saniye ve t eşittir 4 saniye ise yol 80 metre olur.",
    );
  });
});

describe("tıp, TUS, biyoloji ve kimya", () => {
  it("iyonlar ve alt simgeli reseptörler", () => {
    expectSpoken("Na⁺ ve K⁺ pompası", "sodyum artı ve potasyum artı pompası");
    expectSpoken("Ca²⁺ artar, Cl⁻ azalır.", "kalsiyum iki artı artar, klor eksi azalır.");
    expectSpoken("β₁ blokajı kalp hızını düşürür; α₁ ve β₂ farklıdır.", "beta bir blokajı kalp hızını düşürür; alfa bir ve beta iki farklıdır.");
    expectSpoken("H⁺ iyonu ve HCO₃⁻", "hidrojen artı iyonu ve bikarbonat");
    expectSpoken("Na+ kanalları açılır.", "sodyum artı kanalları açılır.");
    expectSpoken("CD4⁺ T hücreleri ve Rh⁻ kan", "CD4 pozitif T hücreleri ve Rh negatif kan");
  });

  it("klinik ölçüler ve oklar", () => {
    expectSpoken("Tansiyon 120 mmHg ise", "Tansiyon 120 milimetre cıva ise");
    expectSpoken("Glikoz 100 mg/dL, sodyum 140 mEq/L", "Glikoz 100 miligram bölü desilitre, sodyum 140 miliekivalan bölü litre");
    expectSpoken("ADH ↑ olunca idrar ↓", "ADH artar olunca idrar azalır");
    expectSpoken("CO₂ + H₂O ⇌ H₂CO₃", "karbondioksit artı haş iki o denge tepkimesi ile haş iki ce o üç");
  });

  it("kimya TeX içinde de okunur", () => {
    expectSpoken("$\\mathrm{H_2O}$ ve $\\mathrm{Na^+}$, $\\mathrm{Ca^{2+}}$", "haş iki o ve sodyum artı, kalsiyum iki artı");
    expectSpoken("$g = 9{,}8\\ \\mathrm{m/s^2}$", "g eşittir 9,8 metre bölü saniye kare");
  });

  it("moleküller ve pH", () => {
    expectSpoken("H₂O ve CO₂ oluşur, O₂ tükenir.", "haş iki o ve karbondioksit oluşur, oksijen tükenir.");
    expectSpoken("pH 7,4 ve pKa", "pe haş 7,4 ve pe ka a");
    expectSpoken("C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O", "glikoz artı 6 oksijen oluşturur 6 karbondioksit artı 6 haş iki o");
    expectSpoken("Fe₂O₃ oluşur.", "demir iki o üç oluşur.");
  });
});

describe("hukuk, tarih ve sosyal bilimler", () => {
  it("madde, fıkra ve kısaltmalar", () => {
    expectSpoken("Anayasa 116. md. uyarınca", "Anayasa yüz on altıncı madde uyarınca");
    expectSpoken("m. 27 ve 2. f. hükmü", "madde 27 ve ikinci fıkra hükmü");
    expectSpoken("Örneğin vb. durumlar; örn. bkz. s. 12", "Örneğin ve benzeri durumlar; örneğin bakınız sayfa 12");
  });

  it("Roma rakamları ve yüzyıl", () => {
    expectSpoken("II. Mahmut döneminde", "İkinci Mahmut döneminde");
    expectSpoken("XIX. yy. sonunda I. Dünya Savaşı", "on dokuzuncu yüzyıl sonunda Birinci Dünya Savaşı");
    expectSpoken("M.Ö. 3000 yılında", "milattan önce 3000 yılında");
  });

  it("sıra sayıları Türkçe", () => {
    expect(ordinalWords(116)).toBe("yüz on altıncı");
    expect(ordinalWords(4)).toBe("dördüncü");
    expect(ordinalWords(40)).toBe("kırkıncı");
  });
});

describe("gerçek bir öğretmen yanıtı", () => {
  it("düz simge, LaTeX, vurgu içinde formül, birim ve kimya tek akışta okunur", () => {
    const reply =
      "Güzel yerden yakaladın! Kök içini sadeleştirme kuralı şöyle: √45 = √9 × √5 olur, yani sonuç 3√5. " +
      "Kilit kural ==\\sqrt{a \\cdot b} = \\sqrt{a} \\cdot \\sqrt{b}==. Fizikte \\Delta P = \\rho g h ve " +
      "g = 9{,}8\\ \\mathrm{m/s^2}; kimyada \\mathrm{H_2O} ile \\mathrm{Na^+}. Sence √20 nasıl sadeleşir?";
    expectSpoken(
      reply,
      "Güzel yerden yakaladın! Kök içini sadeleştirme kuralı şöyle: kök 45 eşittir kök 9 çarpı kök 5 olur, yani sonuç " +
        "3 kök 5. Kilit kural kök a çarpı b eşittir kök a çarpı kök b. Fizikte delta P eşittir ro g h ve g eşittir 9,8 " +
        "metre bölü saniye kare; kimyada haş iki o ile sodyum artı. Sence kök 20 nasıl sadeleşir?",
    );
  });
});

describe("biçim", () => {
  it("tablo satırı cümleye döner, emoji ve kod okunmaz", () => {
    const out = speak("| Kavram | Anlamı |\n|---|---|\n| kök | karekök |\n📌 Sınav ipucu: `x`");
    expect(out).toBe("Kavram, Anlamı.\nkök, karekök.\nSınav ipucu: x");
  });

  it("boş metin boş kalır", () => {
    expect(speak("")).toBe("");
    expect(speak("   ")).toBe("");
  });
});
