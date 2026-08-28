import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ParentLinkStatus = {
  hasOpenLink: boolean;
  hasActiveChild: boolean;
  pendingCount: number;
  activeCount: number;
};

/** pending veya active bağlantı — veli paneline giriş için yeterli. */
export async function getParentLinkStatus(
  supabase: SupabaseClient,
  parentId: string,
): Promise<ParentLinkStatus> {
  const { data } = await supabase
    .from("parent_student_links")
    .select("status")
    .eq("parent_id", parentId)
    .in("status", ["pending", "active"]);

  const rows = data ?? [];
  const pendingCount = rows.filter((row) => row.status === "pending").length;
  const activeCount = rows.filter((row) => row.status === "active").length;

  return {
    hasOpenLink: rows.length > 0,
    hasActiveChild: activeCount > 0,
    pendingCount,
    activeCount,
  };
}
