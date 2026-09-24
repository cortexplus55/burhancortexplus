import { describe, expect, it } from "vitest";
import { replaceTopicNodes, type RefoldWriter } from "@/lib/documents/topic-map-refold";

/**
 * Konu düğümü silinince sınav hazırlığındaki bağ NULL olur.
 * Yeniden katlama bu yüzden eski satırı, yenisi yazılmadan silmez
 * ve aynı anda iki isteğin haritayı boşaltmasına izin vermez.
 */

type Row = { id: string; title: string };

function memory(initial: Row[]) {
  let rows = [...initial];
  let updatedAt: string | null = "t0";
  const history: number[] = [rows.length];
  const snap = () => {
    history.push(rows.length);
  };
  let inserts = 0;
  let failInsertAt: number | null = null;
  const writer: RefoldWriter = {
    claim: async (observedAt) => {
      if (updatedAt !== observedAt) return false;
      updatedAt = "t1";
      return true;
    },
    insert: async (index) => {
      inserts += 1;
      if (failInsertAt !== null && inserts === failInsertAt) {
        throw new Error("insert failed");
      }
      const id = `new-${index}`;
      rows = [...rows, { id, title: `folded-${index}` }];
      snap();
      return id;
    },
    deleteIds: async (ids) => {
      const drop = new Set(ids);
      rows = rows.filter((row) => !drop.has(row.id));
      snap();
    },
  };
  return {
    writer,
    rows: () => rows,
    history: () => history,
    updatedAt: () => updatedAt,
    failInsertAt: (n: number) => {
      failInsertAt = n;
    },
  };
}

describe("replaceTopicNodes", () => {
  it("keeps the old topics until every new topic is inserted", async () => {
    const store = memory([
      { id: "old-a", title: "VİZEDE DİKKAT" },
      { id: "old-b", title: "Nozul ve Difüzörler" },
    ]);
    const outcome = await replaceTopicNodes(store.writer, {
      observedAt: "t0",
      oldIds: ["old-a", "old-b"],
      count: 1,
    });
    expect(outcome).toBe("replaced");
    expect(store.rows()).toEqual([{ id: "new-0", title: "folded-0" }]);
    expect(Math.min(...store.history())).toBeGreaterThan(0);
  });

  it("rolls back a partial insert and leaves the original map", async () => {
    const store = memory([
      { id: "old-a", title: "VİZEDE DİKKAT" },
      { id: "old-b", title: "Nozul ve Difüzörler" },
    ]);
    store.failInsertAt(2);
    const outcome = await replaceTopicNodes(store.writer, {
      observedAt: "t0",
      oldIds: ["old-a", "old-b"],
      count: 2,
    });
    expect(outcome).toBe("rolled-back");
    expect(store.rows().map((row) => row.id)).toEqual(["old-a", "old-b"]);
    expect(Math.min(...store.history())).toBeGreaterThan(0);
  });

  it("lets a second claim lose without touching topics", async () => {
    const store = memory([{ id: "old-a", title: "VİZEDE DİKKAT" }]);
    const first = replaceTopicNodes(store.writer, {
      observedAt: "t0",
      oldIds: ["old-a"],
      count: 1,
    });
    const second = replaceTopicNodes(store.writer, {
      observedAt: "t0",
      oldIds: ["old-a"],
      count: 1,
    });
    const [a, b] = await Promise.all([first, second]);
    expect([a, b].sort()).toEqual(["replaced", "skipped-claim"]);
    expect(store.rows().filter((row) => row.id.startsWith("old-"))).toHaveLength(0);
    expect(store.rows().filter((row) => row.id.startsWith("new-"))).toHaveLength(1);
    expect(Math.min(...store.history())).toBeGreaterThan(0);
  });

  it("drops the new rows instead of the old ones when a prep attaches mid-write", async () => {
    const store = memory([{ id: "old-a", title: "VİZEDE DİKKAT" }]);
    const outcome = await replaceTopicNodes(
      {
        ...store.writer,
        beforeDeleteOld: async () => "rollback",
      },
      { observedAt: "t0", oldIds: ["old-a"], count: 1 },
    );
    expect(outcome).toBe("rolled-back");
    expect(store.rows()).toEqual([{ id: "old-a", title: "VİZEDE DİKKAT" }]);
  });

  it("does not delete either set when the prep already points at a new id", async () => {
    const store = memory([{ id: "old-a", title: "VİZEDE DİKKAT" }]);
    const outcome = await replaceTopicNodes(
      {
        ...store.writer,
        beforeDeleteOld: async () => "keep",
      },
      { observedAt: "t0", oldIds: ["old-a"], count: 1 },
    );
    expect(outcome).toBe("kept-both");
    expect(store.rows().map((row) => row.id).sort()).toEqual(["new-0", "old-a"]);
  });
});
