/**
 * Okulda paylaşılan bir hazırlığa katıl: kopyası öğrencinin hesabına açılır
 * (`/api/school`). Okul akışı ve arama sayfası aynı çağrıyı kullanır.
 */
export async function joinSchoolPrep(prepId: string): Promise<{ id: string; alreadyJoined: boolean }> {
  const res = await fetch("/api/school", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prepId }),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; alreadyJoined?: boolean };
  if (!res.ok || !data.id) throw new Error("join_failed");
  return { id: data.id, alreadyJoined: Boolean(data.alreadyJoined) };
}
