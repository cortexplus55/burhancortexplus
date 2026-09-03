import { describe, expect, it } from "vitest";
import {
  feedSubjects,
  filterBySubject,
  popularIds,
  toFeedRows,
  toSummary,
  type SchoolFeedRow,
} from "@/lib/parity/school-feed";

function row(over: Partial<SchoolFeedRow> = {}): SchoolFeedRow {
  return {
    id: "a",
    title: "Türev",
    examType: "Matematik",
    examDate: null,
    viewCount: 0,
    ownerName: "Ada",
    isOwn: false,
    topicCount: 5,
    ...over,
  };
}

describe("toFeedRows", () => {
  it("RPC satırlarını görünüm biçimine çevirir", () => {
    const rows = toFeedRows([
      {
        id: "p1",
        title: "Türev",
        exam_type: "Matematik",
        exam_date: "2026-09-10",
        view_count: "7",
        owner_name: "Ada",
        is_own: false,
        topic_count: "4",
      },
    ]);
    expect(rows[0]).toEqual({
      id: "p1",
      title: "Türev",
      examType: "Matematik",
      examDate: "2026-09-10",
      viewCount: 7,
      ownerName: "Ada",
      isOwn: false,
      topicCount: 4,
    });
  });

  it("bozuk girdide çökmez", () => {
    expect(toFeedRows(null)).toEqual([]);
    expect(toFeedRows([{ title: "kimliksiz" }])).toEqual([]);
  });
});

describe("toSummary", () => {
  it("okul kartı verisini çıkarır", () => {
    expect(
      toSummary([
        { school_id: "s1", school_name: "Lise", member_count: "12", shared_count: "3" },
      ]),
    ).toEqual({
      schoolId: "s1",
      schoolName: "Lise",
      memberCount: 12,
      sharedCount: 3,
    });
  });

  it("okul seçilmemişse null", () => {
    expect(toSummary([])).toBeNull();
    expect(toSummary(null)).toBeNull();
  });
});

describe("popularIds", () => {
  // Rozet akışın kendi dağılımına göre; sabit bir eşik küçük okulda hiç
  // tetiklenmez, büyük okulda herkesi popüler yapardı.
  it("ortalamanın belirgin üstündekileri işaretler", () => {
    const rows = [
      row({ id: "a", viewCount: 20 }),
      row({ id: "b", viewCount: 2 }),
      row({ id: "c", viewCount: 1 }),
    ];
    const popular = popularIds(rows);
    expect(popular.has("a")).toBe(true);
    expect(popular.has("b")).toBe(false);
  });

  it("veri azken hiçbirini işaretlemez", () => {
    expect(popularIds([row({ viewCount: 99 })]).size).toBe(0);
  });

  it("hiç görüntülenme yoksa boş", () => {
    expect(popularIds([row(), row({ id: "b" }), row({ id: "c" })]).size).toBe(0);
  });

  // Hepsi eşitse kimse diğerinden popüler değildir.
  it("tüm sayılar eşitse kimseyi işaretlemez", () => {
    const rows = [
      row({ id: "a", viewCount: 5 }),
      row({ id: "b", viewCount: 5 }),
      row({ id: "c", viewCount: 5 }),
    ];
    expect(popularIds(rows).size).toBe(0);
  });
});

describe("ders filtresi", () => {
  const rows = [
    row({ id: "a", examType: "Matematik" }),
    row({ id: "b", examType: "Fizik" }),
    row({ id: "c", examType: null }),
  ];

  it("dersleri alfabetik listeler", () => {
    expect(feedSubjects(rows)).toEqual(["Fizik", "Matematik"]);
  });

  it("seçilen derse göre süzer", () => {
    expect(filterBySubject(rows, "Fizik").map((r) => r.id)).toEqual(["b"]);
  });

  it("filtre yoksa hepsini döndürür", () => {
    expect(filterBySubject(rows, null)).toHaveLength(3);
  });
});
