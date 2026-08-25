import { AppShell } from "@/components/layout/app-shell";
import { FeatureFlagRow } from "@/components/admin/feature-flag-row";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Feature flag" };

const DEFAULT_FLAGS = [
  { key: "rag_sources", description: "Sohbette doküman kaynaklarını göster" },
  { key: "teacher_panel", description: "Öğretmen panelini aç" },
  { key: "paytr_live", description: "PayTR canlı mod (yalnız onay sonrası)" },
];

export default async function AdminFeatureFlagsPage() {
  await requireAdmin();
  const service = createServiceClient();

  const { data: flags } = await service
    .from("feature_flags")
    .select("key, enabled, description");

  const known = new Map((flags ?? []).map((flag) => [flag.key, flag]));
  const merged = [
    ...DEFAULT_FLAGS.map((flag) => ({
      key: flag.key,
      description: known.get(flag.key)?.description ?? flag.description,
      enabled: known.get(flag.key)?.enabled ?? false,
    })),
    ...(flags ?? [])
      .filter((flag) => !DEFAULT_FLAGS.some((item) => item.key === flag.key))
      .map((flag) => ({
        key: flag.key,
        description: flag.description ?? "",
        enabled: flag.enabled,
      })),
  ];

  return (
    <AppShell variant="admin" title="Feature flag">
      <ul className="divide-y rounded-lg border">
        {merged.map((flag) => (
          <FeatureFlagRow
            key={flag.key}
            flagKey={flag.key}
            description={flag.description}
            enabled={flag.enabled}
          />
        ))}
      </ul>
    </AppShell>
  );
}
