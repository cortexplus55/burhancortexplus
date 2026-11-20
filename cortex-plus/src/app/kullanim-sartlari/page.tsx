import KullanimKosullariPage from "@/app/kullanim-kosullari/page";

/**
 * "/kullanim-sartlari" (19 Kasım 2026, Faz 3): aynı metin aynı bileşenle, 200 OK. Arama motoru tek adresi görsün diye
 * kanonik adres "/kullanim-kosullari". Metin ve sürüm `src/lib/legal/terms-text.ts`'te; burada kopya yok.
 */
export const metadata = {
  title: "Kullanım koşulları",
  description: "Cortex Plus hizmetinin kullanım şartları.",
  alternates: { canonical: "/kullanim-kosullari" },
};

export default KullanimKosullariPage;
