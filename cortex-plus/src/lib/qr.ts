import "server-only";
import QRCode from "qrcode";

/**
 * QR kodları sunucuda üretilir.
 *
 * Önceki `qrImageUrl()` veriyi `api.qrserver.com` adresine query string olarak
 * gönderiyordu. Telefon yükleme akışında bu, oturum token'ının üçüncü taraf bir
 * servise ve onun erişim loglarına gitmesi demekti — o token'ı gören biri
 * kullanıcının oturumuna dosya yükleyebilirdi. Artık hiçbir veri dışarı çıkmaz.
 *
 * SVG döner: rasterden keskin, boyuttan bağımsız ve satır içi gömülebilir.
 */
export async function qrSvg(data: string, size = 220): Promise<string> {
  return QRCode.toString(data, {
    type: "svg",
    width: size,
    margin: 1,
    errorCorrectionLevel: "M",
    color: {
      // Koyu arayüzde de okunsun diye beyaz zemin bırakılır; QR tarayıcıları
      // zıtlığa duyarlı.
      dark: "#000000",
      light: "#ffffff",
    },
  });
}

/** `<img src>` içinde doğrudan kullanılabilecek data URI. */
export async function qrDataUri(data: string, size = 220): Promise<string> {
  const svg = await qrSvg(data, size);
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}
