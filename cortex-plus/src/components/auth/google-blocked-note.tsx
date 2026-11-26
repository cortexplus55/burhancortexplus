import Link from "next/link";
import { NATIVE_APP_LABEL } from "@/lib/auth/in-app-browser";
import { cn } from "@/lib/utils";

/** Google düğmesinin yerine: uygulamanın tarayıcısında Google girişi çalışmaz (`in-app-browser.ts`). */
export function GoogleBlockedNote({ app, className }: { app: string; className?: string }) {
  if (app === NATIVE_APP_LABEL) {
    return (
      <p role="note" className={cn("rounded-xl border px-4 py-3 text-sm", className)}>
        Uygulamada e-posta ve şifrenle giriş yapılıyor. Hesabını Google ile açtıysan önce{" "}
        <Link href="/sifremi-unuttum" className="underline">
          Şifremi unuttum
        </Link>{" "}
        ile bir şifre belirle; aynı hesapla devam edersin.
      </p>
    );
  }
  return (
    <p role="note" className={cn("rounded-xl border px-4 py-3 text-sm", className)}>
      {app} uygulamasının tarayıcısındasın; Google burada girişe izin vermiyor. E-postanla devam et ya da
      sağ üstteki menüden sayfayı tarayıcıda aç.
    </p>
  );
}
