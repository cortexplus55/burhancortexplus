/**
 * Düelloyu paylaşmak (31 Ekim 2026, lansman zırhı). Öğrenci düelloyu WhatsApp grubundan getirir; bugüne kadar tek yol
 * "Bağlantıyı kopyala"ydı. Paylaşım metni hazır gelir: oynamadan önce çağrı, oynadıktan sonra puanla meydan okuma.
 * WhatsApp bağlantısı (`wa.me/?text=`) telefonda uygulamayı, bilgisayarda WhatsApp Web'i açar; hesap ya da izin
 * istemez. Metin öğrencinin adını taşımaz (yalnız düellonun başlığı ve puan).
 */

export function duelInviteText(title: string): string {
  return `“${title.trim()}” düellosuna gel: aynı sorularda, aynı sürede yarışalım. Hesap gerekmiyor.`;
}

export function duelChallengeText(title: string, correct: number, total: number): string {
  return `“${title.trim()}” düellosunda ${correct}/${total} yaptım. Geçebilir misin?`;
}

export function whatsappShareHref(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}

/** Misafirin kayıt bağlantısı: düelloyu kuranın davet koduyla (ikisine de davet hediyesi). */
export function duelSignupHref(referralCode: string | null | undefined): string {
  const code = (referralCode ?? "").trim();
  return /^[A-Za-z0-9]{4,16}$/.test(code) ? `/kayit?ref=${encodeURIComponent(code.toUpperCase())}` : "/kayit";
}
