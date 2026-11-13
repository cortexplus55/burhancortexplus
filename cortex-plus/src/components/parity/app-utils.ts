/** Pure helpers shared by Server and Client Components (no "use client"). */

export function parityGreetingName(fullName: string | null | undefined): string {
  if (!fullName?.trim()) return "Merhaba";
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  // Ad yoksa e-posta geliyor: selamda adres yazılmaz (8 Kasım 2026).
  if (!first || first.includes("@")) return "Merhaba";
  // Kayıtta küçük harfle yazılan ad selamda "burhan" görünüyordu; baş harf Türkçe kurala göre büyür, gerisine dokunulmaz.
  return first.charAt(0).toLocaleUpperCase("tr-TR") + first.slice(1);
}

/**
 * Sunucuda çalışır; Vercel saati UTC. Türkiye saatine sabitlenmezse sabah
 * 07:40'ta "iyi geceler" yazıyordu (30 Eylül 2026).
 */
export function parityTimeGreeting(now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", hourCycle: "h23" }).format(now),
  );
  if (hour >= 5 && hour < 12) return "Günaydın";
  if (hour >= 12 && hour < 18) return "İyi günler";
  if (hour >= 18 && hour < 23) return "İyi akşamlar";
  return "İyi geceler";
}

/**
 * Profil kapsülündeki ad (13 Kasım 2026, Faz 2): selamdaki gibi ilk ad, baş harfi Türkçe kuralla büyük; ad yoksa
 * e-postanın kullanıcı adı. Kabuğu açan her sayfa bunu verir (ana ekran ve hazırlık sohbeti kabuğu kendisi kuruyor).
 */
export function parityShellName(fullName: string | null | undefined, email: string | null | undefined): string {
  const greet = parityGreetingName(fullName);
  return greet !== "Merhaba" ? greet : email?.split("@")[0] || "Öğrenci";
}

/**
 * Profil kartındaki tam ad (13 Kasım 2026, Faz 2): her sözcüğün baş harfi Türkçe kuralla büyük, gerisine dokunulmaz
 * (kayıtta küçük harfle yazılan ad panelde "burhan" görünüyordu; selamdaki 8 Kasım kuralının tam ad hâli). Ad yoksa
 * kapsüldeki ad.
 */
export function parityFullName(fullName: string | null | undefined, email: string | null | undefined): string {
  const words = (fullName ?? "").trim().split(/\s+/).filter((word) => word && !word.includes("@"));
  if (!words.length) return parityShellName(null, email);
  return words.map((word) => word.charAt(0).toLocaleUpperCase("tr-TR") + word.slice(1)).join(" ");
}

export function parityUserInitial(
  fullName: string | null | undefined,
  email: string | null | undefined,
): string {
  const first = parityGreetingName(fullName ?? email);
  return first.slice(0, 1).toUpperCase() || "?";
}
