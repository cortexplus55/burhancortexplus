export function appOrigin() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://cortexplus.app"
  );
}

// qrImageUrl() kaldırıldı: veriyi api.qrserver.com'a query string olarak
// gönderiyordu. Telefon yükleme akışında bu, oturum token'ının üçüncü taraf bir
// servisin erişim loglarına düşmesi demekti. QR artık sunucuda üretiliyor —
// bkz. src/lib/qr.ts. Yeni bir QR ihtiyacında oradaki qrDataUri() kullanılmalı.
