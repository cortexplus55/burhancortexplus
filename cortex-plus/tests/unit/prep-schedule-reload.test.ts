import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPrepScheduleTopics } from "@/lib/learning/prep-schedule-topics";
import { packTopicPerspective } from "@/lib/documents/outline-topic-meta";
import {
  buildExamScheduleV2,
  redistributeRemainingSchedule,
  type ScheduleBuildResult,
  type ScheduleTopicInput,
} from "@/lib/learning/exam-schedule-v2";

/*
  19 Ekim 2026: yeniden planlama (tarih değişince, ayarlar, kaçırılan gün, uyarlamalı plan) konuları
  eski oturumlardan kuruyordu. Dosya etiketi, sayfalar, kavram birimleri ve sınav ağırlığı kayboluyor;
  "zorlandığım" denen konu yolun başına sıçrıyordu. Kaçırılan gün kendiliğinden tetiklendiği için
  doğru kurulmuş plan sessizce bozuluyordu. Şimdi dördü de `loadPrepScheduleTopics`ten okur.
*/

type Row = Record<string, unknown>;

/** Yalnız yükleyicinin kullandığı zincir: from → select → eq/in → order. */
function fakeService(tables: Record<string, Row[]>): SupabaseClient {
  const builder = (rows: Row[]) => {
    let current = rows;
    const api = {
      select: () => api,
      eq: (column: string, value: unknown) => {
        current = current.filter((row) => row[column] === value);
        return api;
      },
      in: (column: string, values: unknown[]) => {
        current = current.filter((row) => values.includes(row[column]));
        return api;
      },
      order: (column: string) => {
        current = [...current].sort((a, b) => Number(a[column]) - Number(b[column]));
        return api;
      },
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: current, error: null }),
    };
    return api;
  };
  return { from: (table: string) => builder(tables[table] ?? []) } as unknown as SupabaseClient;
}

const heavy = packTopicPerspective({ examWeight: "high", prerequisiteTitles: ["Sinir Dokusu"] });
const medium = packTopicPerspective({ examWeight: "medium" });

const TABLES = {
  exam_prep_topics: [
    // Sıra karışık yazıldı: yükleyici sort_order'a göre okur.
    {
      id: "row-ap",
      exam_prep_id: "prep",
      label: "Dinlenme ve Aksiyon Potansiyeli",
      sort_order: 1,
      document_topic_node_id: "node-ap",
      source_refs: [{ documentId: "pdf", fileName: "AYT.pdf", pages: [5, 6, 7], nodeId: "node-ap" }],
      measured_level: "weak",
    },
    {
      id: "row-neuron",
      exam_prep_id: "prep",
      label: "Sinir Dokusu",
      sort_order: 0,
      document_topic_node_id: "node-neuron",
      source_refs: [{ documentId: "pdf", fileName: "AYT.pdf", pages: [3, 4], nodeId: "node-neuron" }],
      measured_level: null,
    },
    {
      id: "row-photo",
      exam_prep_id: "prep",
      label: "Refrakter Dönem",
      sort_order: 2,
      document_topic_node_id: null,
      source_refs: [{ documentId: "photo", fileName: "Tahta.jpg", pages: [1], nodeId: null }],
      measured_level: "bogus",
    },
  ],
  document_topic_nodes: [
    {
      id: "node-ap",
      units: [
        { title: "Dinlenme potansiyeli", pages: [5] },
        { title: "Aksiyon potansiyeli", pages: [6, 7] },
      ],
      ...heavy,
    },
    { id: "node-neuron", units: [{ title: "Tek birim", pages: [3] }], ...medium },
  ],
};

const PREVIOUS = {
  sessions: [
    { topicId: "node-neuron", topicTitle: "Sinir Dokusu", sourcePages: [], role: "learn" },
    { topicId: "node-ap", topicTitle: "Dinlenme ve Aksiyon Potansiyeli", sourcePages: [], role: "learn" },
    // Konu tablosunda adıyla eşlenen eski kimlik (belgesiz eski kurulum gibi).
    { topicId: "topic:2", topicTitle: "Refrakter dönem", sourcePages: [1], role: "learn" },
    // Konu tablosunda olmayan eski oturum konusu.
    { topicId: "legacy", topicTitle: "Eski Konu", sourcePages: [9], role: "learn" },
  ],
} as unknown as ScheduleBuildResult;

describe("yeniden planlamanın konuları", () => {
  it("hazırlığın sırası, eski kimlikler, kaynaklar, birimler, ağırlık ve ölçülen seviye korunur", async () => {
    const topics = await loadPrepScheduleTopics(fakeService(TABLES), {
      prepId: "prep",
      previous: PREVIOUS,
      hardTopics: ["Dinlenme ve Aksiyon Potansiyeli"],
    });
    expect(topics.map((topic) => topic.id)).toEqual(["node-neuron", "node-ap", "topic:2", "legacy"]);
    const [neuron, ap, photo, legacy] = topics as [ScheduleTopicInput, ScheduleTopicInput, ScheduleTopicInput, ScheduleTopicInput];
    expect(neuron.pageNumbers).toEqual([3, 4]);
    expect(neuron.units).toBeUndefined(); // tek birim: mekanik bölme
    expect(neuron.examHeavy).toBe(false);
    expect(ap.units?.map((unit) => unit.title)).toEqual(["Dinlenme potansiyeli", "Aksiyon potansiyeli"]);
    expect(ap.examHeavy).toBe(true);
    expect(ap.importance).toBe("important");
    expect(ap.prerequisites).toEqual(["Sinir Dokusu"]);
    expect(ap.measuredLevel).toBe("weak");
    expect(ap.selfHard).toBe(true);
    expect(ap.sourceRefs?.[0]?.fileName).toBe("AYT.pdf");
    expect(photo.measuredLevel).toBe("unknown");
    expect(photo.sourceRefs?.[0]?.documentId).toBe("photo");
    expect(legacy.pageNumbers).toEqual([9]);
  });

  it("yeniden kurulan yol sırayı korur, dosya etiketini ve ders bölümlerini kaybetmez", async () => {
    const topics = await loadPrepScheduleTopics(fakeService(TABLES), {
      prepId: "prep",
      previous: PREVIOUS,
      hardTopics: ["Dinlenme ve Aksiyon Potansiyeli"],
    });
    const from = new Date("2026-10-20T08:00:00Z");
    const first = buildExamScheduleV2({ daysToExam: 20, dailyMinutes: 45, studyDays: [1, 2, 3, 4, 5, 6, 7], topics, fromDate: from });
    const rebuilt = redistributeRemainingSchedule({
      previous: first,
      completed: [],
      dailyMinutes: 45,
      studyDays: [1, 2, 3, 4, 5, 6, 7],
      daysToExam: 18,
      topics,
      fromDate: new Date("2026-10-22T08:00:00Z"),
    });
    const lessons = rebuilt.sessions.filter((s) => s.role === "learn").sort((a, b) => a.sortOrder - b.sortOrder);
    // "Zorlandığım" ve zayıf konu başa sıçramaz.
    expect([...new Set(lessons.map((s) => s.topicId))]).toEqual(["node-neuron", "node-ap", "topic:2", "legacy"]);
    // İki kavram birimi iki ders; dosya etiketi düğüm başlığında kalır.
    expect(lessons.filter((s) => s.topicId === "node-ap")).toHaveLength(2);
    expect(lessons.find((s) => s.topicId === "node-ap")?.sourceLabel).toBe("AYT s.5–7");
  });
});
