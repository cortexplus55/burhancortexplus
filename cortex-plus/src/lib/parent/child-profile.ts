export type LinkedChildProfile = {
  full_name: string | null;
  grade_level: string | null;
  school_name: string | null;
  avatar_url: string | null;
};

export function firstLinkedProfile(value: unknown): LinkedChildProfile | null {
  if (Array.isArray(value)) return (value[0] as LinkedChildProfile) ?? null;
  return (value as LinkedChildProfile) ?? null;
}

export function childAvatarLabel(child: LinkedChildProfile | null) {
  if (child?.avatar_url && !child.avatar_url.startsWith("http")) {
    return child.avatar_url;
  }
  return (child?.full_name ?? "?").slice(0, 1).toUpperCase();
}

export function childMetaLine(child: LinkedChildProfile | null) {
  return (
    [child?.grade_level, child?.school_name].filter(Boolean).join(" · ") ||
    "Profil bilgisi yok"
  );
}
