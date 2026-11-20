import QRCode from "qrcode";

/*
  Yerel, deterministik QR kodu (Faz 7, 20 Kasım 2026). Hiçbir ağ isteği yapmaz: `qrcode` paketinin kodlayıcısı modül
  matrisini cihazda/sunucuda hesaplar, SVG'yi biz çizeriz (tek <path>, kenar boşluğu dahil). Aynı veri her zaman aynı
  SVG'yi verir; sunucuda da istemcide de çalışır (pazarlama kartındaki önizleme, sınav sabahı kâğıdının alt bilgisi).
  Okunabilirlik için koyu modül siyah, zemin beyaz kalır (tarayıcılar zıtlığa duyarlı; koyu temada da beyaz kutu).
*/

export type QrSvgOptions = {
  /** Çizim genişliği/yüksekliği (piksel ya da viewBox birimi). Varsayılan 160. */
  size?: number;
  /** Sessiz bölge (modül sayısı). QR standardı 4 önerir; baskıda 2 yeterli. Varsayılan 2. */
  margin?: number;
  /** Hata düzeltme düzeyi. Varsayılan "M" (yaklaşık %15 hasar). */
  level?: "L" | "M" | "Q" | "H";
  /** Ekran okuyucu için ad (SVG <title>). */
  title?: string;
  dark?: string;
  light?: string;
};

export type QrMatrix = { size: number; isDark: (row: number, col: number) => boolean };

/** Modül matrisi (test ve özel çizim için). Boş veri hata fırlatır. */
export function qrMatrix(data: string, level: QrSvgOptions["level"] = "M"): QrMatrix {
  const value = String(data ?? "");
  if (!value) throw new Error("qr_empty");
  const code = QRCode.create(value, { errorCorrectionLevel: level });
  const size = code.modules.size;
  return { size, isDark: (row, col) => Boolean(code.modules.get(row, col)) };
}

const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** SVG metni. Koyu modüller satır satır birleştirilmiş yatay şeritlerle tek path olarak çizilir. */
export function qrSvgMarkup(data: string, options: QrSvgOptions = {}): string {
  const { size = 160, margin = 2, level = "M", title, dark = "#000000", light = "#ffffff" } = options;
  const matrix = qrMatrix(data, level);
  const total = matrix.size + margin * 2;
  let path = "";
  for (let row = 0; row < matrix.size; row += 1) {
    let col = 0;
    while (col < matrix.size) {
      if (!matrix.isDark(row, col)) {
        col += 1;
        continue;
      }
      const start = col;
      while (col < matrix.size && matrix.isDark(row, col)) col += 1;
      path += `M${start + margin} ${row + margin}h${col - start}v1h-${col - start}z`;
    }
  }
  const label = title ? `<title>${escapeXml(title)}</title>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" ` +
    `shape-rendering="crispEdges"${title ? ' role="img"' : ' aria-hidden="true"'}>${label}` +
    `<rect width="${total}" height="${total}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`
  );
}

/** `<img src>` için data URI (sunucuda ve istemcide; Buffer gerektirmez). */
export function qrSvgDataUri(data: string, options: QrSvgOptions = {}): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvgMarkup(data, options))}`;
}
