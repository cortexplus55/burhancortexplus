/**
 * Örnek akışta bırakılan dosya bizim örnek notumuz mu?
 *
 * Denetim tarayıcıda yapılıyor ve dosya sunucuya hiç gitmiyor. Örnek akış
 * bilerek giriş istemiyor; buraya bir yükleme ucu koymak, kullanıcıya
 * bağlanamayan, herkese açık bir dosya kabul noktası açmak olurdu — hız
 * sınırı kullanıcı kimliğine yazılıyor, misafirin kimliği yok. Ziyaretçinin
 * dosyası kendi bilgisayarından çıkmıyor, yalnızca özeti hesaplanıyor.
 *
 * Bu bir güvenlik denetimi DEĞİL: atlatan kişinin kazancı, zaten herkese açık
 * olan örneği görmek. İşi ziyaretçiye doğru dosyayı bıraktığını söylemek.
 */

/** `public/ornek/fotosentez-ders-notu.pdf` — özet, ad ve boyut. */
export const DEMO_PDF_SHA256 =
  "7c31bf5c20a681d05e322b4da8a0f0fe31f540135d1a884b872707e9f4efef1f";
export const DEMO_PDF_NAME = "fotosentez-ders-notu.pdf";
export const DEMO_PDF_BYTES = 214184;

export type SourceVerdict = "match" | "other-pdf" | "not-pdf";

export type DroppedFile = {
  name: string;
  type: string;
  size: number;
  /** SHA-256, onaltılık küçük harf. Tarayıcı hesaplayamadıysa `null`. */
  sha256: string | null;
};

export function looksLikePdf(file: { name: string; type: string }): boolean {
  // Sürükle-bırakta bazı tarayıcılar `type`ı boş veriyor; ada da bakıyoruz.
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function verdictFor(file: DroppedFile): SourceVerdict {
  const isOurs =
    file.sha256 !== null
      ? file.sha256.toLowerCase() === DEMO_PDF_SHA256
      : // `crypto.subtle` yalnızca güvenli bağlamda var (https ya da
        // localhost). Yokken ada ve boyuta düşüyoruz. Yanlış kabul ucuz:
        // kabul edilenin tek sonucu zaten herkese açık örneği görmek.
        file.name === DEMO_PDF_NAME && file.size === DEMO_PDF_BYTES;

  if (isOurs) return "match";
  return looksLikePdf(file) ? "other-pdf" : "not-pdf";
}

/** Dosyanın SHA-256'sı; tarayıcı hesaplayamıyorsa `null`. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    const digest = await subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}
