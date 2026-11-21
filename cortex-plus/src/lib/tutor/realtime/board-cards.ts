import {
  BOARD_BODY_MAX,
  BOARD_CARD_MAX,
  BOARD_TITLE_MAX,
  BOARD_TOOL_NAME,
  type BoardCard,
  type BoardCardKind,
} from "@/lib/tutor/realtime/config";

/*
  "Konuşurken tahta kartları" (21 Kasım 2026, ürün sahibinin onayı). Öğretmen sesle anlatırken ekranda görünmesi
  faydalı bir formül ya da kilit kavramı `tahtaya_yaz` aracıyla yazar; EK MODEL ÇAĞRISI YOK: araç aynı Realtime
  oturumunun içinde, modelin kendi çağrısıdır. İstemci kartı canlı transkriptin akışına ekler ve araca boş bir onay
  döner ki konuşma sürsün; oturum bitince kart sohbete kaydedilen metne girer (geçmişte de görünür).

  Kartın içeriği modelden gelir, bu yüzden her iki uçta aynı süzgeçten geçer (`sanitizeBoardCard`): tür yalnız iki
  değerden biri, başlık ve gövde boş olamaz, sınırı aşan kısaltılır, kontrol karakteri düşer. Ekranda
  gövde KaTeX çizicisinden (`MathText`, kendi kaçışıyla) geçer; ham HTML hiçbir yerde basılmaz.
*/

/** Realtime oturumuna verilen araç tanımı (OpenAI işlev aracı biçimi). */
export const BOARD_TOOL = {
  type: "function" as const,
  name: BOARD_TOOL_NAME,
  description:
    "Konuşurken ekrandaki tahtaya küçük bir kart yazar. Yalnız gerçekten görünmesi faydalı bir formül, tanım ya da " +
    "kilit kavram için. Konuşmayı bölmeden çağır, sonra kaldığın yerden konuşmaya devam et.",
  parameters: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["formula", "concept"],
        description: "formula: formül ya da bağıntı; concept: tanım ya da kilit kavram.",
      },
      title: { type: "string", description: "Kısa başlık, en çok 6 kelime." },
      body: {
        type: "string",
        description: "formula için TeX, $…$ içinde (örnek: $a^2+b^2=c^2$); concept için en çok iki kısa cümle.",
      },
    },
    required: ["kind", "title", "body"],
    additionalProperties: false,
  },
};

// Kontrol karakterleri ve sıfır genişlikli işaretler (yeni satır hariç).
const INVISIBLE = [0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029, 0xfeff]
  .map((code) => String.fromCharCode(code))
  .join("");
 
const CONTROL = new RegExp(`[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f${INVISIBLE}]`, "g");

function cleanLine(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const text = value.replace(CONTROL, "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/** TeX gövdesi: dış `$` işaretleri tekdüze `$…$` olur; içi boşsa kart yok. Kısaltma formülü bozmasın diye sınırı aşan atılır. */
function cleanFormula(value: unknown): string {
  if (typeof value !== "string") return "";
  const raw = value.replace(CONTROL, "").trim();
  const inner = raw.replace(/^\${1,2}/, "").replace(/\${1,2}$/, "").trim();
  if (!inner || inner.length > BOARD_BODY_MAX) return "";
  if (inner.includes("$")) return "";
  return `$${inner}$`;
}

export type BoardCardInput = { kind?: unknown; title?: unknown; body?: unknown };

/** Modelin aracına gelen ya da /end gövdesindeki kartı doğrular; geçmezse null. */
export function sanitizeBoardCard(input: BoardCardInput): Omit<BoardCard, "id"> | null {
  const kind: BoardCardKind | null = input.kind === "formula" || input.kind === "concept" ? input.kind : null;
  if (!kind) return null;
  const title = cleanLine(input.title, BOARD_TITLE_MAX);
  if (!title) return null;
  const body = kind === "formula" ? cleanFormula(input.body) : cleanLine(input.body, BOARD_BODY_MAX);
  if (!body) return null;
  return { kind, title, body };
}

/** Aracın JSON argümanı → kart; bozuk JSON ya da geçersiz kart null. */
export function parseBoardToolArguments(raw: string): Omit<BoardCard, "id"> | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") return null;
    return sanitizeBoardCard(value as BoardCardInput);
  } catch {
    return null;
  }
}

/** Oturum başına sınır: sınırı aşan kart eklenmez (modele de "sınır" diye döner). */
export function boardCardAllowed(count: number): boolean {
  return count < BOARD_CARD_MAX;
}

/** Araca dönen çıktı: konuşma sürsün diye kısa onay; sınırda modele bildirilir. */
export function boardToolOutput(accepted: boolean): string {
  return JSON.stringify(accepted ? { ok: true } : { ok: false, reason: "limit" });
}

/**
 * Sohbete kaydedilen metindeki biçim: formül kartı sohbetin formül kartı (`$$…$$`), kavram kartı kilit bilgi işareti
 * (`==…==`) ile. Böylece geçmişte aynı görsel dille çizilir.
 */
export function boardCardMarkdown(card: Omit<BoardCard, "id">): string {
  if (card.kind === "formula") {
    const tex = card.body.replace(/^\$/, "").replace(/\$$/, "");
    return `**${card.title}**\n\n$$${tex}$$`;
  }
  return `==${card.title}==: ${card.body}`;
}
