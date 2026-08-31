import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/guards";

export async function GET(request: Request) {
  // Fired on each keystroke of the school typeahead, so the ceiling is high.
  const guard = await withUser(request, { scope: "schools-search", limit: 90 });
  if (!guard.ok) return guard.response;
  const { supabase } = guard.ctx;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) {
    const { data } = await supabase
      .from("schools")
      .select("name, city, district")
      .order("name")
      .limit(8);
    return NextResponse.json({ schools: (data ?? []).map((r) => r.name) });
  }

  const { data, error } = await supabase
    .from("schools")
    .select("name, city, district")
    .ilike("name", `%${q}%`)
    .order("name")
    .limit(12);

  if (error) {
    return NextResponse.json({ schools: [] });
  }

  return NextResponse.json({
    schools: (data ?? []).map((r) =>
      r.city ? `${r.name} (${r.city})` : r.name,
    ),
  });
}
