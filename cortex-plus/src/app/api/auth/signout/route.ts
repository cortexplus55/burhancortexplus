import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function POST() {
  const supabase = await createClient();
  // Yalnız bu cihaz (31 Ekim 2026). Varsayılan "global" bütün cihazlardaki oturumu kapatıyordu: okuldaki bilgisayardan
  // çıkış yapan öğrencinin telefonu da çıkış yapmış oluyordu. Hesap silmede (actions.ts) bütün oturumlar kapanır.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}
