import { createClient, createServiceClient } from "@/lib/supabase/server";
import { DEVICE_COOKIE } from "@/lib/auth/device-sessions";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

const PUSH_TOKEN_PATTERN = /^[A-Za-z0-9:_\-.]{16,4096}$/;

/** Formdaki bildirim anahtarı (yalnız mobil uygulamada dolu); yoksa null. */
async function formPushToken(request: Request): Promise<string | null> {
  if (!request.headers.get("content-type")?.includes("form")) return null;
  try {
    const token = String((await request.formData()).get("push_token") ?? "").trim();
    return PUSH_TOKEN_PATTERN.test(token) ? token : null;
  } catch {
    return null;
  }
}

/**
 * Mobil uygulamada çıkış (26 Kasım 2026): form bu cihazın bildirim anahtarını taşır (`push_token`,
 * `NativePushTokenField`). Anahtar oturum kapanmadan, yalnız bu hesabın satırıysa silinir: ortak telefonda çıkış yapan
 * öğrencinin bildirimleri sonraki kişiye gitmesin. Web formunda alan yoktur, ek istek atılmaz; silme düşerse çıkış yine
 * yapılır.
 */
async function forgetPushToken(supabase: SupabaseClient, token: string): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await createServiceClient().from("user_push_tokens").delete().eq("user_id", user.id).eq("token", token);
  } catch {
    /* tablo yok ya da ağ düştü: çıkış sürer */
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const pushToken = await formPushToken(request);
  if (pushToken) await forgetPushToken(supabase, pushToken);
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
