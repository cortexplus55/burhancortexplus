import { cn } from "@/lib/utils";

/** Google düğmesinin yerine: uygulamanın tarayıcısında Google girişi çalışmaz (`in-app-browser.ts`). */
export function GoogleBlockedNote({ app, className }: { app: string; className?: string }) {
  return (
    <p role="note" className={cn("rounded-xl border px-4 py-3 text-sm", className)}>
      {app} uygulamasının tarayıcısındasın; Google burada girişe izin vermiyor. E-postanla devam et ya da
      sağ üstteki menüden sayfayı tarayıcıda aç.
    </p>
  );
}
