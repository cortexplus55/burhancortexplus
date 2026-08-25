import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { requireTeacher } from "@/lib/auth/session";
import { formatNumber } from "@/lib/format";

export const metadata = { title: "Öğretmen paneli" };

const links = [
  { href: "/ogretmen-paneli/siniflar", label: "Sınıflar" },
  { href: "/ogretmen-paneli/ogrenciler", label: "Öğrenciler" },
  { href: "/ogretmen-paneli/odevler", label: "Ödevler" },
  { href: "/ogretmen-paneli/quizler", label: "Quizler" },
  { href: "/ogretmen-paneli/raporlar", label: "Raporlar" },
];

export default async function OgretmenPaneliPage() {
  const { supabase, user } = await requireTeacher();

  const { data: classrooms } = await supabase
    .from("classrooms")
    .select("id, classroom_members(id)")
    .eq("teacher_id", user.id);

  const studentCount = (classrooms ?? []).reduce(
    (sum, classroom) => sum + (classroom.classroom_members?.length ?? 0),
    0,
  );

  return (
    <AppShell variant="admin" title="Öğretmen paneli">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Sınıf</p>
            <p className="mt-1 text-2xl font-semibold">
              {formatNumber(classrooms?.length ?? 0)}
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Öğrenci</p>
            <p className="mt-1 text-2xl font-semibold">
              {formatNumber(studentCount)}
            </p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Öğrencilerin AI öğretmen sohbetleri gizlidir ve panelde görüntülenmez.
        </p>

        <nav className="grid gap-2 sm:grid-cols-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md border px-4 py-3 text-sm hover:bg-accent"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </AppShell>
  );
}
