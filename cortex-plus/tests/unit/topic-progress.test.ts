import { describe, expect, it } from "vitest";
import {
  topicProgressFromNodes,
  type PathNodeLike,
} from "@/lib/learning/exam-prep-ui-path";

const node = (
  id: string,
  dayIndex: number,
  status: PathNodeLike["status"],
  topicTitle?: string,
): PathNodeLike => ({
  id,
  dayIndex,
  status,
  sessionMeta: topicTitle ? { topicTitle } : null,
});

describe("topicProgressFromNodes", () => {
  it("counts finished activities per topic", () => {
    const rows = topicProgressFromNodes([
      node("1", 0, "done", "Faz Bağıntıları"),
      node("2", 0, "ready", "Faz Bağıntıları"),
      node("3", 1, "locked", "Kayma Mukavemeti"),
      node("4", 1, "locked", "Kayma Mukavemeti"),
    ]);
    expect(rows).toEqual([
      { title: "Faz Bağıntıları", done: 1, total: 2, pct: 50, firstDayIndex: 0 },
      { title: "Kayma Mukavemeti", done: 0, total: 2, pct: 0, firstDayIndex: 1 },
    ]);
  });

  it("orders topics the way the plan introduces them", () => {
    // Alfabetik sıralamak öğrencinin gördüğü sırayla çelişirdi.
    const rows = topicProgressFromNodes([
      node("1", 5, "ready", "Zemin Sınıflandırması"),
      node("2", 1, "ready", "Atterberg Limitleri"),
      node("3", 3, "ready", "Permeabilite"),
    ]);
    expect(rows.map((r) => r.title)).toEqual([
      "Atterberg Limitleri",
      "Permeabilite",
      "Zemin Sınıflandırması",
    ]);
  });

  it("leaves out activities that belong to no topic", () => {
    // Deneme sınavı ve genel tekrar bir konuya yazılamaz.
    const rows = topicProgressFromNodes([
      node("1", 0, "done", "Efektif Gerilme"),
      node("2", 9, "locked"),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(1);
  });

  it("keeps a topic whose day numbers arrive out of order", () => {
    const rows = topicProgressFromNodes([
      node("1", 4, "done", "Konsolidasyon"),
      node("2", 2, "done", "Konsolidasyon"),
    ]);
    expect(rows[0]).toMatchObject({ firstDayIndex: 2, done: 2, pct: 100 });
  });
});
