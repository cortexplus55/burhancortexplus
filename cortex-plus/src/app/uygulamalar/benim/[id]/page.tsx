import { notFound } from "next/navigation";
import Link from "next/link";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { UserAppFrame } from "@/components/parity/user-app-frame";
import { UserAppShareToggle } from "@/components/parity/user-app-share";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";

export const metadata = { title: "Uygulama" };

export default async function KullaniciUygulamasiPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  // RLS iki durumu birden karşılıyor: sahibi ya da aynı okuldan biri.
  // Erişimi olmayan kullanıcı boş satır alır ve 404 görür.
  const { data: app } = await supabase
    .from("user_apps")
    .select("id, user_id, title, description, html, visibility")
    .eq("id", id)
    .maybeSingle();

  if (!app) notFound();

  const isOwner = app.user_id === user.id;
  if (!isOwner) {
    // Sayacı sahibinin kendi açılışları şişirmesin diye fonksiyon içinde de
    // kontrol var; burada boşuna çağrı yapmıyoruz.
    await supabase.rpc("increment_user_app_view", { p_app_id: app.id });
  }

  return (
    <AstraParitySorShell {...shell}>
      <div className="ap-uapp">
        <header className="ap-uapp-head">
          <div>
            <h1>{app.title}</h1>
            {app.description ? <p>{app.description}</p> : null}
          </div>
          {isOwner ? (
            <UserAppShareToggle
              appId={app.id}
              shared={app.visibility === "school"}
            />
          ) : null}
        </header>

        <UserAppFrame html={app.html} title={app.title} />

        <Link href="/uygulamalar" className="ap-pz-back">
          ← Uygulamalara dön
        </Link>
      </div>
    </AstraParitySorShell>
  );
}
