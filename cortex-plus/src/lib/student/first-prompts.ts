import { startGreeting } from "@/lib/companion/voice";

/**
 * Ana ekrandaki "Başla": öğretmen ilk sözü kendisi söyler (8 Kasım 2026); model çağrısı yok, kaydedilmez.
 * Asıl cümle dost katmanında (`companion/voice.ts`), sinyale göre değişir; bu yardımcı sinyalsiz sade hâli verir
 * (örnek ekranlar ve testler).
 */
export function startGreetingFor(firstName: string | null | undefined): string {
  return startGreeting({ firstName: firstName ?? null, mood: null, streak: 0, daysSinceLast: null, examDaysLeft: null, hour: 12, seed: "sabit" });
}
