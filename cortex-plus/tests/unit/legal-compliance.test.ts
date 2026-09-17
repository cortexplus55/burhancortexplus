import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  SELLER,
  isSellerComplete,
  missingSellerFields,
  sellerField,
} from "@/lib/legal/seller";
import {
  CANCELLATION_SECTIONS,
  DELIVERY_SECTIONS,
  DISTANCE_SALES_SECTIONS,
  PRE_INFO_SECTIONS,
} from "@/lib/legal/texts";

/*
  Mesafeli satış için mevzuatın istediği asgari yapı.

  Bu testler metinlerin "güzel" olmasını değil, ÜRÜNÜN GERÇEĞİYLE
  ÇELİŞMEMESİNİ tutuyor. Sözleşmede söz verilip üründe yapılmayan şey, hiç söz
  vermemekten daha büyük sorumluluk doğurur.
*/

describe("zorunlu hukuki sayfalar", () => {
  const pages = [
    "mesafeli-satis",
    "on-bilgilendirme",
    "iptal-iade",
    "teslimat",
    "gizlilik",
    "kvkk",
    "kullanim-kosullari",
    "iletisim",
  ];

  for (const slug of pages) {
    it(`/${slug} sayfası var`, () => {
      expect(existsSync(`src/app/${slug}/page.tsx`)).toBe(true);
    });
  }

  it("dördü de footer'dan erişilebiliyor", () => {
    const footer = readFileSync("src/components/parity/marketing.tsx", "utf8");
    for (const slug of ["mesafeli-satis", "on-bilgilendirme", "iptal-iade", "teslimat"]) {
      expect(footer).toContain(`href="/${slug}"`);
    }
  });
});

describe("satıcı bilgileri", () => {
  it("şahıs işletmesi için gereken alanlar tanımlı", () => {
    for (const key of ["legalName", "address", "phone", "email", "taxOffice", "taxNumber"] as const) {
      expect(SELLER).toHaveProperty(key);
    }
  });

  /*
    Alanlar şu an boş ve bu BİLEREK: uydurulmuş bir adres ya da vergi
    numarası, hiç yazmamaktan kötü. Test boşluğu hata saymıyor — eksikliğin
    GÖRÜNÜR olmasını şart koşuyor.
  */
  it("eksik alanlar tespit ediliyor", () => {
    expect(missingSellerFields({ ...SELLER, legalName: "" })).toContain(
      "Ad soyad / ünvan",
    );
    expect(
      isSellerComplete({
        legalName: "A", address: "B", phone: "C",
        email: "d@e.f", taxOffice: "G", taxNumber: "1", website: "x",
      }),
    ).toBe(true);
  });

  it("boş alan metinde açıkça işaretleniyor", () => {
    expect(sellerField("legalName", { ...SELLER, legalName: "" })).toBe("[doldurulacak]");
  });

  it("eksiklik hukuki sayfalarda uyarıya dönüyor", () => {
    const warn = readFileSync("src/components/layout/seller-warning.tsx", "utf8");
    expect(warn).toContain("missingSellerFields");
    expect(warn).toContain('role="alert"');
  });
});

describe("sözleşme metinleri ürünle çelişmiyor", () => {
  const all = [
    ...PRE_INFO_SECTIONS, ...DISTANCE_SALES_SECTIONS,
    ...CANCELLATION_SECTIONS, ...DELIVERY_SECTIONS,
  ].flatMap((s) => s.body).join("\n");

  it("her bölümün başlığı ve gövdesi var", () => {
    for (const set of [PRE_INFO_SECTIONS, DISTANCE_SALES_SECTIONS, CANCELLATION_SECTIONS, DELIVERY_SECTIONS]) {
      expect(set.length).toBeGreaterThan(2);
      for (const sec of set) {
        expect(sec.heading.trim().length).toBeGreaterThan(3);
        expect(sec.body.length).toBeGreaterThan(0);
      }
    }
  });

  /* Cayma hakkı: dijital hizmet anında ifa ediliyor (m.15/1-ğ). */
  it("cayma hakkının bulunmadığı ve dayanağı yazılı", () => {
    expect(all).toContain("15");
    expect(all).toContain("cayma hakkı kullanılamaz");
  });

  /*
    auto_renew varsayılanı false. Sözleşme "otomatik yenilenir" deseydi
    üründe olmayan bir şeyi vaat etmiş olurduk.
  */
  it("otomatik yenileme YOK diyor ve kod da öyle", () => {
    expect(all).toContain("otomatik olarak yenilenmez");
    const sql = readFileSync(
      "supabase/migrations/20260906130000_subscription_billing.sql", "utf8",
    );
    expect(sql).toContain("auto_renew boolean NOT NULL DEFAULT false");
  });

  /* Kredi iadesi sözünün kodda karşılığı var mı? */
  it("kredi iadesi sözünün karşılığı kodda", () => {
    expect(all).toContain("kredi düşülmez");
    const route = readFileSync("src/app/api/ai/chat/route.ts", "utf8");
    expect(route).toContain("saidNoSource");
  });

  it("kart bilgisinin saklanmadığı yazılı", () => {
    expect(all).toContain("saklanmaz");
  });
});

/*
  En ciddi eksik buydu: ödeme doğrudan başlıyordu, hiçbir teyit yoktu.
  Mesafeli Sözleşmeler Yönetmeliği m.5 siparişten ÖNCE teyit istiyor.
*/
describe("ödeme öncesi onay", () => {
  const cards = readFileSync("src/components/parity/subscription-cards.tsx", "utf8");
  const route = readFileSync(
    "src/app/api/payments/paytr/create-token/route.ts", "utf8",
  );

  it("arayüzde onay kutusu var ve iki belgeye de bağlanıyor", () => {
    expect(cards).toContain("legalAccepted");
    expect(cards).toContain('href="/on-bilgilendirme"');
    expect(cards).toContain('href="/mesafeli-satis"');
  });

  it("onaysız ödeme başlamıyor", () => {
    expect(cards).toContain("if (!legalAccepted");
  });

  /*
    İstemci kapısı tek başına yetmez: istek doğrudan da atılabilir. Ödemeyi
    BAŞLATAN uç sunucuda, teyidin son duracağı yer orası.
  */
  it("sunucu da onayı zorunlu tutuyor", () => {
    expect(route).toContain("legalAccepted: z.literal(true)");
    expect(route).toContain("legal_consent_required");
  });

  it("onay kanıt olarak kaydediliyor", () => {
    // Dosyada "legal_consent" iki kez geçiyor: biri hata kodu
    // (legal_consent_required), diğeri denetim kaydı. Aranan ikincisi.
    const meta = route.slice(route.indexOf("legal_consent: {"));
    expect(meta.length).toBeGreaterThan(0);
    expect(meta.slice(0, 300)).toContain("at:");
    expect(meta.slice(0, 300)).toContain("ip: userIp");
    expect(meta.slice(0, 300)).toContain("documents:");
  });
});
