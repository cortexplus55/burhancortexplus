export function parentPlusHref(
  studentId?: string | null,
  extra?: { plan?: string | null },
) {
  const params = new URLSearchParams();
  if (studentId) params.set("ogrenci", studentId);
  if (extra?.plan) params.set("plan", extra.plan);
  const query = params.toString();
  return query ? `/veli/plus?${query}` : "/veli/plus";
}
