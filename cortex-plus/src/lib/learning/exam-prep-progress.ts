export type PrepTopicStatus = "ready" | "in_progress" | "done";

export type PrepTopic = {
  id: string;
  label: string;
  sortOrder: number;
  status: PrepTopicStatus;
  lessonId: string | null;
};

export function normalizeTopicStatus(value: string | null | undefined): PrepTopicStatus {
  if (value === "done" || value === "in_progress") return value;
  return "ready";
}

export function topicProgress(topics: PrepTopic[]) {
  const total = topics.length;
  const done = topics.filter((topic) => topic.status === "done").length;
  return {
    done,
    total,
    pct: total ? Math.round((done / total) * 100) : 0,
  };
}

export function nextOpenTopic(topics: PrepTopic[]) {
  return topics.find((topic) => topic.status !== "done") ?? null;
}

export function continueHref(prepId: string, topics: PrepTopic[]) {
  const next = nextOpenTopic(topics);
  if (next) return `/deneme-sinavlari/${prepId}/calis?topic=${next.id}`;
  return `/deneme-sinavlari/${prepId}`;
}

export function mapPrepTopics(
  rows: {
    id: string;
    label: string;
    sort_order: number;
    status?: string | null;
    lesson_id?: string | null;
  }[],
): PrepTopic[] {
  return rows
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((row) => ({
      id: row.id,
      label: row.label,
      sortOrder: row.sort_order,
      status: normalizeTopicStatus(row.status),
      lessonId: row.lesson_id ?? null,
    }));
}
