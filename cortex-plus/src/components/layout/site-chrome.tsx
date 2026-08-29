import Link from "next/link";

export { SiteHeader } from "@/components/layout/site-header";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t py-10 text-sm text-muted-foreground">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 md:grid-cols-3">
        <div>
          <p className="font-medium text-foreground">Cortex Plus</p>
          <p className="mt-2">Kişisel AI destekli öğrenme platformu.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Link href="/gizlilik">Gizlilik</Link>
          <Link href="/kvkk">KVKK</Link>
          <Link href="/kullanim-kosullari">Kullanım koşulları</Link>
        </div>
        <div className="flex flex-col gap-2">
          <Link href="/iletisim">İletişim</Link>
          <Link href="/hakkimizda">Hakkımızda</Link>
        </div>
      </div>
    </footer>
  );
}
