/*
  Öğretmen v3 karşılaması (teacher.v2 ana sohbeti, 21 Kasım 2026, ürün sahibinin istemi): "Başla"dan sonraki boş sohbet.
  Selam, seçili hazırlığa göre tek cümle ve sağa yaslı üç hap. Hap ya da öğrencinin yazdığı ilk mesaj sohbet isteğinde
  `welcomeAnswer: true` ile gider (sunucu onu öğrencinin öğrenme tercihini anlattığı tur olarak işler).

  "Kaldığın yerden" (aynı gün, ürün sahibinin onayı): karşılama açılınca `GET /api/teacher/start-cards` istenir; yanıtta
  `resume` varsa selamın altındaki ilk satır onun cümlesi olur ve hapların en üstüne devam hapı gelir. Alan yoksa, null ise
  ya da istek düşerse hiçbir şey değişmez.
*/

export const WELCOME_HAPS = [
  "En iyi pratik yaparak öğreniyorum",
  "Bazı konularda zorlanıyorum",
  "Hocam nelere odaklanmamız gerektiğini söyledi",
] as const;

export const RESUME_HAP = "Kaldığımız yerden devam edelim";

export const START_CARDS_ENDPOINT = "/api/teacher/start-cards";

export function welcomeLines(input: { firstName?: string | null; prepTitle?: string | null }): { hello: string; body: string } {
  const name = String(input.firstName ?? "").trim();
  const prep = String(input.prepTitle ?? "").trim();
  return {
    hello: name ? `Selam ${name}!` : "Selam!",
    body: prep
      ? `${prep} için nasıl hazırlanmak istediğini anlat: nasıl öğrenmeyi sevdiğini, nelerde zorlandığını ya da hocanın sınavda çıkacağını söylediği konuları. Bunları hatırlayacağım.`
      : "Bugün neyi birlikte çalışalım? Nasıl öğrenmeyi sevdiğini ya da nerede zorlandığını anlatırsan hatırlarım.",
  };
}

export type ResumeOffer = { line: string; prompt: string; conversationId: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Uçtan gelen `resume` alanı; biçimi tutmazsa null (ekran değişmez). */
export function parseResume(value: unknown): ResumeOffer | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { line?: unknown; prompt?: unknown; conversationId?: unknown };
  const line = typeof raw.line === "string" ? raw.line.replace(/\s+/g, " ").trim() : "";
  const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : "";
  if (!line || !prompt || line.length > 240 || prompt.length > 2000) return null;
  const conversationId = typeof raw.conversationId === "string" && UUID.test(raw.conversationId) ? raw.conversationId : null;
  return { line, prompt, conversationId };
}
