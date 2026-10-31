import { createClient } from "@/lib/supabase/server";
import { DEVICE_COOKIE } from "@/lib/auth/device-sessions";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function POST() {
  const supabase = await createClient();
  // Yalnız bu cihaz (31 Ekim 2026). Varsayılan "global" bütün cihazlardaki oturumu kapatıyordu: okuldaki bilgisayardan
  // çıkış yapan öğrencinin telefonu da çıkış yapmış oluyordu. Hesap silmede (actions.ts) bütün oturumlar kapanır.
  await supabase.auth.signOut({ scope: "local" });
  // Cihaz sınırının çerezi de gider (31 Ekim 2026): kalsaydı ara katman bir sonraki istekte "bu oturum cihaz
  // sınırıyla mı düştü" diye boşuna bir kez sorardı. Çıkış yapılan oturum sınırda sayılmaz (auth.sessions'ta yok).
  try {
    (await cookies()).set(DEVICE_COOKIE, "", { path: "/", maxAge: 0 });
  } catch {
    /* çerez yazılamazsa ara katman bir kez sorup kendisi siler */
  }
  redirect("/");
}
