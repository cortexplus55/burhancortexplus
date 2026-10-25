import { describe, expect, it } from "vitest";
import { listExplainAttempts, saveExplainAttempt } from "@/lib/learning/explain-history-store";

function failingClient(code: string) {
  const result = { data: null, error: { code, message: "relation does not exist" } };
  const query: {
    select: () => typeof query;
    eq: () => typeof query;
    order: () => typeof query;
    limit: () => typeof query;
    insert: () => typeof query;
    maybeSingle: () => Promise<typeof result>;
    then: Promise<typeof result>["then"];
  } = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: () => query,
    insert: () => query,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return { from: () => query };
}

describe("anlatım geçmişi tablo yokken sessiz", () => {
  it.each(["42P01", "PGRST205"])("%s listeyi boş, kaydı yok sayar", async (code) => {
    const client = failingClient(code);
    await expect(
      listExplainAttempts(client as never, { userId: "00000000-0000-0000-0000-000000000001", topic: "Konu" }),
    ).resolves.toEqual([]);
    await expect(
      saveExplainAttempt(client as never, {
        userId: "00000000-0000-0000-0000-000000000001",
        topic: "Konu",
        explanation: "Kendi cümlem.",
        review: { verdict: "kismen", summary: "Eksik bağ.", gaps: [], missed: [], followUp: "Bir örnek ver." },
      }),
    ).resolves.toBeNull();
  });
});
