export const ADMIN_USER_PAGE_SIZE = 50;

export type AdminPlanFilter = "free" | "plus" | "sigma";

export function parseAdminPlanFilter(raw?: string | null): AdminPlanFilter | null {
  if (raw === "free" || raw === "plus" || raw === "sigma") return raw;
  return null;
}

export function parseAdminPage(raw?: string | null): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) return 1;
  return value;
}

export function adminUsersHref(opts: {
  q?: string;
  plan?: AdminPlanFilter | null;
  page?: number;
}): string {
  const params = new URLSearchParams();
  if (opts.q) params.set("q", opts.q);
  if (opts.plan) params.set("plan", opts.plan);
  if (opts.page && opts.page > 1) params.set("page", String(opts.page));
  const query = params.toString();
  return query ? `/admin/kullanicilar?${query}` : "/admin/kullanicilar";
}

export function subscriptionPlanKind(input: {
  tier?: string | null;
  slug?: string | null;
}): "plus" | "sigma" | null {
  const tier = (input.tier ?? "").toLowerCase();
  const slug = (input.slug ?? "").toLowerCase();
  if (tier === "sigma" || slug.includes("sigma")) return "sigma";
  if (tier === "plus" || slug.includes("plus")) return "plus";
  return null;
}
