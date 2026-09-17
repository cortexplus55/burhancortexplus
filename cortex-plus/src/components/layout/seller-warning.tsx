import { missingSellerFields } from "@/lib/legal/seller";

/**
 * Satıcı bilgileri eksikse hukuki sayfanın başında kırmızı uyarı.
 *
 * Bilgiler uydurulmadı: yanlış bir adres ya da vergi numarası yazmak hiç
 * yazmamaktan kötü. Ama eksikliğin SESSİZ kalması da kötü — sayfa yayına
 * çıkar, kimse fark etmez ve ilk denetimde çıkar. Bu yüzden eksiklik
 * okuyucuya da, site sahibine de görünüyor.
 */
export function SellerWarning() {
  const missing = missingSellerFields();
  if (!missing.length) return null;

  return (
    <div
      role="alert"
      className="mb-8 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm leading-relaxed text-red-200"
    >
      <p className="font-semibold">Bu sayfa henüz tamamlanmadı.</p>
      <p className="mt-2">
        Satıcı bilgilerinin bir kısmı eksik: {missing.join(", ")}. Metinlerde
        bu alanlar “[doldurulacak]” olarak görünüyor.
      </p>
      <p className="mt-2 text-red-300/80">
        Bilgiler <code>src/lib/legal/seller.ts</code> dosyasına girilene kadar
        ödeme akışı yasal olarak eksik sayılır.
      </p>
    </div>
  );
}
