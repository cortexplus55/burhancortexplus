/** Seviye kontrolü istemci ↔ sunucu biçimleri. Cevap anahtarı başlatma yanıtında yoktur. */
import type { Difficulty } from "@/lib/level-check/mastery";
import type { LevelSource } from "@/lib/level-check/token-types";

export type LevelItem = {
  id: string;
  unitId: string;
  unitTitle: string;
  outcomeId: string;
  outcomeCode: string;
  outcomeText: string;
  difficulty: Difficulty;
  stem: string;
  choices: string[];
};

export type LevelStartRequest =
  | { mode: "quick_scan"; units: string[] }
  | { mode: "unit_check"; unit: string; prepId: string }
  /** Ünite sonu pekiştirme (Plan PR 4): zayıf kazanım başına havuzdan en çok 2 ek soru. */
  | { mode: "reinforce"; unit: string; prepId: string; peek?: boolean }
  /** Paket 3: "🔥 Bu Alt Konudan Yeni Pekiştirme Testi Aç": tek kazanıma yeni doğrulanmış sorular (0 kredi, günlük sınır). */
  | { mode: "reinforce_new"; unit: string; prepId: string; code: string; fill?: boolean };

/** Pekiştirme önerisi: zayıf kazanım + şu an sunulabilecek (yanıtlanmamış, doğrulanmış) ek soru sayısı (≤ 2). */
export type OfferOutcome = { code: string; text: string; count: number };

/** Pekiştirmede havuzda ek sorusu olmayan zayıf kazanım (dürüst bildirim için). */
export type MissingOutcome = { code: string; text: string };

export type LevelStartResponse =
  | { status: "ok"; token: string; source: LevelSource; guest: boolean; items: LevelItem[]; persisted: boolean; missing?: MissingOutcome[]; more?: boolean }
  | { status: "empty"; missing?: MissingOutcome[]; weakCount?: number }
  | { status: "done" }
  /** reinforce_new: günlük sınır doldu / ücretsiz hesapta konu kilitli / üretim şu an yapılamadı. */
  | { status: "limit"; limit: number }
  | { status: "locked" }
  | { status: "unavailable" }
  | { status: "paused" }
  /** peek: soru göndermeden gerçek öneri (yalnız ek sorusu olan kazanımlar; toplam = sunulacak soru sayısı). */
  | { status: "offer"; offer: OfferOutcome[]; total: number; weakCount: number; missing: MissingOutcome[] };

export type LevelAnswerResponse = { correct: boolean; answer: number; explanation: string; persisted: boolean };

export type LevelApi = {
  start: (req: LevelStartRequest) => Promise<LevelStartResponse>;
  answer: (input: { token: string; itemId: string; choice: number; timeMs: number }) => Promise<LevelAnswerResponse>;
};

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

export const httpLevelApi: LevelApi = {
  start: (req) => post<LevelStartResponse>("/api/level-check/start", req),
  answer: (input) => post<LevelAnswerResponse>("/api/level-check/answer", input),
};
