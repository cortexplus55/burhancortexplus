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
  | { mode: "reinforce"; unit: string; prepId: string };

/** Pekiştirmede havuzda ek sorusu olmayan zayıf kazanım (dürüst bildirim için). */
export type MissingOutcome = { code: string; text: string };

export type LevelStartResponse =
  | { status: "ok"; token: string; source: LevelSource; guest: boolean; items: LevelItem[]; persisted: boolean; missing?: MissingOutcome[] }
  | { status: "empty"; missing?: MissingOutcome[]; weakCount?: number }
  | { status: "done" };

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
