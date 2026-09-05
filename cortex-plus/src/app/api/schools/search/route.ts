import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/guards";

/**
 * Okul arama.
 *
 * Eskiden yalnızca `schools: string[]` döndürüyordu ve seçim profiles.school_name
 * içine serbest metin olarak yazılıyordu — üstelik bazen "Okul (Şehir)"
 * biçiminde. Aynı okul iki farklı dizeyle kaydedilebildiği için okul ağı bunun
 * üzerine kurulamıyordu.
 *
 * Artık `results` alanında kimlikle birlikte dönüyor. `schools` alanı geriye
 * dönük uyumluluk için korunuyor; henüz güncellenmemiş çağıranlar bozulmasın.
 */
export async function GET(request: Request) {
  // Okul listesi tüm kullanıcılara açık bir veri kümesi; asıl korunan şey
  // her tuş vuruşunda tetiklenen aramanın veritabanına bindirdiği yük.
  const guard = await withUser(request, {
    scope: "school-search",
    limit: 40,
    dailyLimit: 400,
  });
  if (!guard.ok) return guard.response;
  const { supabase } = guard.ctx;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 80);

  const query = supabase.from("schools").select("id, name, city, district");
  const { data, error } =
    q.length < 2
      ? await query.order("name").limit(8)
      : await query.ilike("name", `%${q}%`).order("name").limit(12);

  if (error) return NextResponse.json({ schools: [], results: [] });

  const rows = data ?? [];
  return NextResponse.json({
    results: rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      city: (r.city as string | null) ?? null,
      district: (r.district as string | null) ?? null,
    })),
    // Geriye dönük: eski istemciler bu dizeyi bekliyor.
    schools: rows.map((r) => (r.city ? `${r.name} (${r.city})` : r.name)),
  });
}
