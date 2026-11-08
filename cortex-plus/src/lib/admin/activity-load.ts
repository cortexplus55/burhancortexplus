import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { auditLabel } from "@/lib/admin/labels";
import {
  aiActionLabel,
  deviceLabel,
  isUserAction,
  mergeEvents,
  nodeKindLabel,
  paymentText,
  scoreText,
  type ActivityCategory,
  type ActivityEvent,
} from "@/lib/admin/activity-feed";

/**
 * Kullanıcı etkinlikleri: on kaynaktan son N günün olayları (8 Kasım 2026). Her kaynak ayrı okunur; biri düşerse
 * öbürleri gelir ve sayfa hangi kaynağın okunamadığını söyler. Kaynak başına en çok `PER_SOURCE` satır (en yeni).
 */
const PER_SOURCE = 400;
export const FEED_LIMIT = 600;

type Row = Record<string, unknown>;
type Source = { name: string; run: () => Promise<ActivityEvent[]> };

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const one = <T>(value: unknown): T | null => (Array.isArray(value) ? ((value[0] as T) ?? null) : ((value as T) ?? null));

export type ActivityQuery = {
  sinceIso: string;
  userId?: string | null;
  category?: ActivityCategory | null;
};

export type ActivityResult = {
  events: ActivityEvent[];
  failedSources: string[];
  names: Map<string, { name: string; email: string | null }>;
};

export async function loadActivity(service: SupabaseClient, query: ActivityQuery): Promise<ActivityResult> {
  const { sinceIso, userId } = query;
  // Supabase sorgu kurucusunun tipi her tabloda farklı; burada yalnız isteğe bağlı kişi süzgeci eklenir.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scoped = (builder: any, column = "user_id"): any => (userId ? builder.eq(column, userId) : builder);
  const want = (category: ActivityCategory) => !query.category || query.category === category;

  const sources: Source[] = [];

  if (want("giris")) {
    sources.push({
      name: "Giriş oturumları",
      run: async () => {
        const { data, error } = await scoped(
          service.from("user_device_sessions").select("session_id, user_id, user_agent, created_at").gte("created_at", sinceIso),
        )
          .order("created_at", { ascending: false })
          .limit(PER_SOURCE);
        if (error) throw error;
        return ((data ?? []) as Row[]).map((row) => ({
          key: `login:${row.session_id}`,
          at: String(row.created_at),
          userId: String(row.user_id),
          category: "giris" as const,
          label: "Giriş yaptı",
          detail: deviceLabel(str(row.user_agent)),
        }));
      },
    });
  }

  if (want("calisma")) {
    sources.push({
      name: "Yol etkinlikleri",
      run: async () => {
        const { data, error } = await scoped(
          service
            .from("exam_prep_node_attempts")
            .select("id, user_id, status, score, total, created_at, updated_at, exam_prep_nodes(kind, title), exam_preps(title)")
            .gte("created_at", sinceIso),
        )
          .order("created_at", { ascending: false })
          .limit(PER_SOURCE);
        if (error) throw error;
        const events: ActivityEvent[] = [];
        for (const row of (data ?? []) as Row[]) {
          const node = one<{ kind?: string; title?: string }>(row.exam_prep_nodes);
          const prep = one<{ title?: string }>(row.exam_preps);
          const kind = nodeKindLabel(node?.kind);
          const where = [str(node?.title) && node?.title !== kind ? node?.title : null, str(prep?.title)].filter(Boolean).join(" · ");
          events.push({
            key: `start:${row.id}`,
            at: String(row.created_at),
            userId: String(row.user_id),
            category: "calisma",
            label: `${kind} açtı`,
            detail: where || null,
          });
          if (row.status === "completed") {
            events.push({
              key: `done:${row.id}`,
              at: String(row.updated_at ?? row.created_at),
              userId: String(row.user_id),
              category: "calisma",
              label: `${kind} bitirdi`,
              detail: [scoreText(num(row.score), num(row.total)), where].filter(Boolean).join(" · ") || null,
            });
          }
        }
        return events;
      },
    });
  }

  if (want("hazirlik")) {
    sources.push({
      name: "Hazırlıklar",
      run: async () => {
        const { data, error } = await scoped(
          service.from("exam_preps").select("id, user_id, title, exam_type, created_at").gte("created_at", sinceIso),
        )
          .order("created_at", { ascending: false })
          .limit(PER_SOURCE);
        if (error) throw error;
        return ((data ?? []) as Row[]).map((row) => ({
          key: `prep:${row.id}`,
          at: String(row.created_at),
          userId: String(row.user_id),
          category: "hazirlik" as const,
          label: "Sınav hazırlığı kurdu",
          detail: str(row.title) ?? str(row.exam_type),
        }));
      },
    });
  }

  if (want("belge")) {
    sources.push({
      name: "Belgeler",
      run: async () => {
        const { data, error } = await scoped(
          service.from("documents").select("id, user_id, file_name, page_count, part_of, created_at").gte("created_at", sinceIso),
        )
          .order("created_at", { ascending: false })
          .limit(PER_SOURCE);
        if (error) throw error;
        return ((data ?? []) as Row[])
          // Parça kopyaları (hızlı başlatma, pencereler) öğrencinin yüklediği ayrı bir belge değil.
          .filter((row) => !row.part_of)
          .map((row) => ({
            key: `doc:${row.id}`,
            at: String(row.created_at),
            userId: String(row.user_id),
            category: "belge" as const,
            label: "Belge yükledi",
            detail: [str(row.file_name), num(row.page_count) ? `${row.page_count} sayfa` : null].filter(Boolean).join(" · ") || null,
          }));
      },
    });
  }

  if (want("yapay-zeka")) {
    sources.push({
      name: "Sohbet ve araçlar",
      run: async () => {
        const { data, error } = await scoped(
          service.from("ai_usage_events").select("id, user_id, action_code, created_at").gte("created_at", sinceIso),
        )
          .order("created_at", { ascending: false })
          .limit(PER_SOURCE * 2);
        if (error) throw error;
        return ((data ?? []) as Row[])
          .filter((row) => isUserAction(String(row.action_code ?? "")))
          .map((row) => ({
            key: `ai:${row.id}`,
            at: String(row.created_at),
            userId: String(row.user_id),
            category: "yapay-zeka" as const,
            label: aiActionLabel(String(row.action_code ?? "")),
          }));
      },
    });
  }

  if (want("deneme")) {
    sources.push({
      name: "Deneme sınavları",
      run: async () => {
        const [{ data: exams, error: examError }, { data: attempts, error: attemptError }] = await Promise.all([
          scoped(service.from("practice_exams").select("id, user_id, title, created_at").gte("created_at", sinceIso))
            .order("created_at", { ascending: false })
            .limit(PER_SOURCE),
          scoped(
            service
              .from("practice_exam_attempts")
              .select("id, user_id, score, completed_at, practice_exams(title)")
              .gte("completed_at", sinceIso),
          )
            .order("completed_at", { ascending: false })
            .limit(PER_SOURCE),
        ]);
        if (examError) throw examError;
        if (attemptError) throw attemptError;
        return [
          ...((exams ?? []) as Row[]).map((row) => ({
            key: `exam:${row.id}`,
            at: String(row.created_at),
            userId: String(row.user_id),
            category: "deneme" as const,
            label: "Deneme sınavı kurdu",
            detail: str(row.title),
          })),
          ...((attempts ?? []) as Row[]).map((row) => ({
            key: `exam-done:${row.id}`,
            at: String(row.completed_at),
            userId: String(row.user_id),
            category: "deneme" as const,
            label: "Deneme sınavını bitirdi",
            detail: [num(row.score) !== null ? `%${Math.round(num(row.score)!)}` : null, str(one<{ title?: string }>(row.practice_exams)?.title)]
              .filter(Boolean)
              .join(" · ") || null,
          })),
        ];
      },
    });
  }

  if (want("odeme")) {
    sources.push({
      name: "Ödemeler",
      run: async () => {
        const [{ data: payments, error }, { data: audits, error: auditError }] = await Promise.all([
          scoped(
            service.from("payments").select("id, user_id, status, amount_try, created_at, plans(name)").gte("created_at", sinceIso),
          )
            .order("created_at", { ascending: false })
            .limit(PER_SOURCE),
          scoped(
            service
              .from("audit_logs")
              .select("id, actor_id, action, created_at")
              .in("action", ["subscription.cancelled", "subscription.resumed"])
              .gte("created_at", sinceIso),
            "actor_id",
          )
            .order("created_at", { ascending: false })
            .limit(PER_SOURCE),
        ]);
        if (error) throw error;
        if (auditError) throw auditError;
        return [
          ...((payments ?? []) as Row[]).map((row) => ({
            key: `pay:${row.id}`,
            at: String(row.created_at),
            userId: String(row.user_id),
            category: "odeme" as const,
            label: paymentText(String(row.status), num(row.amount_try), one<{ name?: string }>(row.plans)?.name ?? null),
          })),
          ...((audits ?? []) as Row[])
            .filter((row) => row.actor_id)
            .map((row) => ({
              key: `audit:${row.id}`,
              at: String(row.created_at),
              userId: String(row.actor_id),
              category: "odeme" as const,
              label: auditLabel(String(row.action)),
            })),
        ];
      },
    });
  }

  if (want("destek")) {
    sources.push({
      name: "Destek ve geri bildirim",
      run: async () => {
        const [support, reports, surveys] = await Promise.all([
          scoped(service.from("support_requests").select("id, user_id, subject, created_at").gte("created_at", sinceIso))
            .order("created_at", { ascending: false })
            .limit(PER_SOURCE),
          scoped(service.from("question_reports").select("id, user_id, reason, created_at").gte("created_at", sinceIso))
            .order("created_at", { ascending: false })
            .limit(PER_SOURCE),
          scoped(service.from("weekly_surveys").select("id, user_id, dismissed, created_at").gte("created_at", sinceIso))
            .order("created_at", { ascending: false })
            .limit(PER_SOURCE),
        ]);
        const failed = [support, reports, surveys].find((result) => result.error);
        if (failed?.error) throw failed.error;
        return [
          ...((support.data ?? []) as Row[])
            .filter((row) => row.user_id)
            .map((row) => ({
              key: `support:${row.id}`,
              at: String(row.created_at),
              userId: String(row.user_id),
              category: "destek" as const,
              label: "Destek talebi açtı",
              detail: str(row.subject),
            })),
          ...((reports.data ?? []) as Row[]).map((row) => ({
            key: `report:${row.id}`,
            at: String(row.created_at),
            userId: String(row.user_id),
            category: "destek" as const,
            label: "Soruda hata bildirdi",
          })),
          ...((surveys.data ?? []) as Row[]).map((row) => ({
            key: `survey:${row.id}`,
            at: String(row.created_at),
            userId: String(row.user_id),
            category: "destek" as const,
            label: row.dismissed ? "Haftalık anketi geçti" : "Haftalık anketi cevapladı",
          })),
        ];
      },
    });
  }

  const settled = await Promise.allSettled(sources.map((source) => source.run()));
  const failedSources: string[] = [];
  const groups: ActivityEvent[][] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") groups.push(result.value);
    else failedSources.push(sources[index]!.name);
  });
  const events = mergeEvents(groups, FEED_LIMIT);
  const names = await loadNames(service, [...new Set(events.map((event) => event.userId))]);
  return { events, failedSources, names };
}

/** Ad profilde, e-posta kimlik tarafında; ikisi de okunamazsa kısaltılmış kimlik gösterilir. */
async function loadNames(service: SupabaseClient, userIds: string[]): Promise<ActivityResult["names"]> {
  const names: ActivityResult["names"] = new Map();
  if (!userIds.length) return names;
  const [{ data: profiles }, auth] = await Promise.all([
    service.from("profiles").select("id, full_name").in("id", userIds.slice(0, 500)),
    service.auth.admin.listUsers({ page: 1, perPage: 1000 }).catch(() => null),
  ]);
  const emails = new Map<string, string>();
  for (const user of auth?.data?.users ?? []) if (user.email) emails.set(user.id, user.email);
  for (const id of userIds) {
    const profile = ((profiles ?? []) as Row[]).find((row) => row.id === id);
    names.set(id, { name: str(profile?.full_name) ?? `Hesap ${id.slice(0, 8)}`, email: emails.get(id) ?? null });
  }
  return names;
}
