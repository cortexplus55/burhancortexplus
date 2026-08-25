import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/ozellikler", label: "Özellikler" },
  { href: "/sinav-hazirligi", label: "Sınav hazırlığı" },
  { href: "/fiyatlandirma", label: "Fiyatlandırma" },
  { href: "/yardim", label: "Yardım" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="font-semibold text-primary">
          Cortex Plus
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-primary">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/giris" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            Giriş
          </Link>
          <Link href="/kayit" className={cn(buttonVariants({ size: "sm" }))}>
            Kayıt ol
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t mt-auto py-10 text-sm text-muted-foreground">
      <div className="mx-auto max-w-6xl px-4 grid gap-6 md:grid-cols-3">
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
