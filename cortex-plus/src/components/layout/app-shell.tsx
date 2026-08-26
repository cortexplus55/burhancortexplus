import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { getUserStreak } from "@/lib/streak/record-activity";
import {
  AstraAppChrome,
  astraUserInitial,
} from "@/components/parity/astra-app-chrome";
import "@/styles/admin-shell.css";

const baseLinks = [
  { href: "/dashboard", label: "Panel" },
  { href: "/ogretmen", label: "AI öğretmen" },
  { href: "/sohbetler", label: "Sohbetler" },
  { href: "/soru-coz", label: "Soru çöz" },
  { href: "/dokumanlar", label: "Dokümanlar" },
  { href: "/quizler", label: "Quiz" },
  { href: "/flashcardlar", label: "Flashcard" },
  { href: "/deneme-sinavlari", label: "Deneme" },
  { href: "/calisma-plani", label: "Plan" },
  { href: "/ilerleme", label: "İlerleme" },
  { href: "/krediler", label: "Krediler" },
  { href: "/bildirimler", label: "Bildirimler" },
];

export async function AppShell({
  children,
  title,
  variant = "student",
}: {
  children: React.ReactNode;
  title?: string;
  variant?: "student" | "admin";
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (variant === "student" && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, avatar_url, primary_role")
      .eq("id", user.id)
      .maybeSingle();

    const avatar = profile?.avatar_url as string | null | undefined;
    const streak = await getUserStreak(supabase, user.id);

    return (
      <AstraAppChrome
        navRole={profile?.primary_role === "parent" ? "parent" : "student"}
        userInitial={astraUserInitial(profile?.full_name, user.email)}
        avatarEmoji={avatar && !avatar.startsWith("http") ? avatar : null}
        pageTitle={title}
        streak={streak}
      >
        {children}
      </AstraAppChrome>
    );
  }

  if (variant === "student" && !user) {
    return <div className="astra-app min-h-dvh p-4">{children}</div>;
  }

  let walletLabel: string | null = null;
  let roles: string[] = [];
  let unread = 0;

  if (user) {
    const [wallet, roleRows, notifications] = await Promise.all([
      supabase
        .from("credit_wallets")
        .select("balance, free_allowance_remaining")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .is("revoked_at", null),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null),
    ]);

    if (wallet.data) {
      walletLabel = `${wallet.data.balance} kredi · ${wallet.data.free_allowance_remaining} ücretsiz hak`;
    }
    roles = (roleRows.data ?? []).map((row) => row.role as string);
    unread = notifications.count ?? 0;
  }

  const links = [...baseLinks];
  if (roles.includes("verified_teacher") || roles.includes("admin")) {
    links.push({ href: "/ogretmen-paneli", label: "Öğretmen paneli" });
  }
  if (roles.includes("admin")) {
    links.push({ href: "/admin", label: "Admin" });
  }

  return (
    <div className="admin-shell flex min-h-screen flex-col md:flex-row">
      <aside className="space-y-4 border-b p-4 md:w-56 md:border-b-0 md:border-r">
        <Link href="/ogretmen" className="block font-semibold text-primary">
          Cortex Plus
        </Link>
        <nav aria-label="Uygulama menüsü">
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm md:flex-col md:gap-2">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-primary">
                  {link.label}
                  {link.href === "/bildirimler" && unread > 0 ? (
                    <Badge variant="secondary" className="ml-2">
                      {unread}
                    </Badge>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {walletLabel ? (
          <p className="hidden text-xs text-muted-foreground md:block">
            {walletLabel}
          </p>
        ) : null}
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b px-4">
          <h1 className="truncate font-medium">{title}</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/profil"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Profil
            </Link>
            <form action="/api/auth/signout" method="post">
              <Button variant="ghost" size="sm" type="submit">
                Çıkış
              </Button>
            </form>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
