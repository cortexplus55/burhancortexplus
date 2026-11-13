import { createClient } from "@/lib/supabase/server";
import { accountActiveOrUnknown } from "@/lib/auth/active-account";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";

/**
 * Herkese açık ama öğrencinin de açtığı sayfalar (13 Kasım 2026, Faz 2: /yardim, /mobil-uygulama): oturum açık
 * öğrenciye uygulama kabuğu, misafire bugünkü pazarlama sayfası. Oturum yoksa ya da hesap askıdaysa `null`;
 * kabuğun verisi okunamazsa da `null` (sayfa misafir görünümüyle açılır, düşmez).
 */
export async function loadOptionalStudentShell() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    if ((await accountActiveOrUnknown(supabase)) === false) return null;
    return await loadParityShellProps(supabase, user.id, user.email);
  } catch {
    return null;
  }
}
