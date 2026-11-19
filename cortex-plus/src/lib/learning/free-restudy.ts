import { seededOrder } from "@/lib/learning/seeded-order";

/**
 * Faz 4 (19 Kasım 2026): %100 ücretsiz yeniden çalışma. Kayıtlı gövdesi olan ders, test, doğru/yanlış, kart,
 * podcast ve yazılı deneme adımı yeniden açıldığında kayıttan açılır: kredi ayırma yok, kullanım kaydı yok, model ve
 * ses çağrısı yok. Yeni üretim yalnız açık istekle (`regenerate`, dersin "Farklı anlat"ı `rewrite`) ya da başka bir
 * konu seçilince (`?konu=`).
 */
export const FREE_RESTUDY_KINDS: ReadonlySet<string> = new Set([
  "lesson",
  "quiz",
  "true_false",
  "flashcards",
  "podcast",
  "written_exam",
]);

export const FREE_RESTUDY_PATH_LABEL = "Yolu Yeniden Çalış (Ücretsiz)";
export const SAVED_DECK_LABEL = "Kayıtlı Kart Desten (Ücretsiz Tekrar)";
export const NEW_DECK_LABEL = "Yeni 8 Kart Üret (8 Kredi)";
export const RESTUDY_STEP_LABEL = "Yeniden Çöz (Ücretsiz)";
export const RESTUDY_NEXT_LABEL = "Sıradaki Adım (Ücretsiz)";

/** Açık "inceleme / tekrar" bayrağı olmadan da kayıttan açılır mı (sunucu güvencesi). */
export function reopensSavedByDefault(input: {
  kind: string;
  nodeStatus: string | null | undefined;
  regenerate?: boolean;
  rewrite?: boolean;
  requestedTopic?: string | null;
  prefetch?: boolean;
  warm?: boolean;
  voiceSession?: boolean;
}): boolean {
  if (!FREE_RESTUDY_KINDS.has(input.kind)) return false;
  if (input.nodeStatus !== "done") return false;
  if (input.regenerate || input.rewrite || input.prefetch || input.warm || input.voiceSession) return false;
  return !input.requestedTopic?.trim();
}

export type RestudyOrder = "path" | "mixed";
export type RestudyNode = { id: string; kind: string; status: string; sortOrder: number };

/** Yeniden çalışma turu: bitmiş, kayıtlı açılabilen adımlar; yol sırasıyla ya da tohumlu karışık sırayla. */
export function restudySequence(nodes: readonly RestudyNode[], order: RestudyOrder, seed: string): string[] {
  const ids = [...nodes]
    .filter((node) => node.status === "done" && FREE_RESTUDY_KINDS.has(node.kind))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((node) => node.id);
  return order === "mixed" ? seededOrder(ids, `restudy:${seed}`) : ids;
}

/** Adres belirteci: "s" (yol sırası) ya da "k<tohum>" (karışık). */
export function restudyToken(order: RestudyOrder, seed: string): string {
  return order === "mixed" ? `k${seed}` : "s";
}

export function parseRestudyToken(token: string | null | undefined): { order: RestudyOrder; seed: string } | null {
  const value = String(token ?? "").trim();
  if (value === "s") return { order: "path", seed: "" };
  const match = /^k([a-z0-9]{4,32})$/i.exec(value);
  return match ? { order: "mixed", seed: match[1]! } : null;
}

export function restudyNodeHref(prepId: string, nodeId: string, token: string): string {
  return `/deneme-sinavlari/${prepId}/dugum/${nodeId}?incele=1&yeniden=${encodeURIComponent(token)}`;
}

/** Turda sıradaki adım; tur bittiyse hazırlığın değerlendirmesi (karne). */
export function nextRestudyHref(input: {
  prepId: string;
  nodes: readonly RestudyNode[];
  token: string;
  currentNodeId: string;
}): string | null {
  const parsed = parseRestudyToken(input.token);
  if (!parsed) return null;
  const sequence = restudySequence(input.nodes, parsed.order, parsed.seed);
  const at = sequence.indexOf(input.currentNodeId);
  if (at < 0) return null;
  const next = sequence[at + 1];
  return next ? restudyNodeHref(input.prepId, next, input.token) : `/deneme-sinavlari/${input.prepId}/degerlendirme`;
}
