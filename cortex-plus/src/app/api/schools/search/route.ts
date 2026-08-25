import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
