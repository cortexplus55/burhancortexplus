import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RecentConversation = { id: string; title: string; updatedAt: string };

/** İstek kapsamı (Faz 2): kabuk ve ana ekran son beş sohbeti aynı istekte bir kez okur. */
const scope = cache((): Map<string, Promise<RecentConversation[]>> => new Map());

export function loadRecentConversations(supabase: SupabaseClient, userId: string): Promise<RecentConversation[]> {
  const store = scope();
  const hit = store.get(userId);
  if (hit) return hit;
  const pending = Promise.resolve(
    supabase
      .from("conversations")
      .select("id, title, updated_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(5),
  ).then(({ data }) =>
    (data ?? []).map((row) => ({
      id: row.id as string,
      title: (row.title as string | null) ?? "Yeni sohbet",
      updatedAt: row.updated_at as string,
    })),
  );
  store.set(userId, pending);
  pending.catch(() => {
    if (store.get(userId) === pending) store.delete(userId);
  });
  return pending;
}
