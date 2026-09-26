import { notFound } from "next/navigation";
import { requireUser, getUserRoles } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Badge, Chip } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { OptionCard } from "@/components/ui/option-card";
import { ProgressBar, ProgressSegments } from "@/components/ui/progress-bar";
import { ProgressRing } from "@/components/ui/progress-ring";
import { TimerPill } from "@/components/ui/timer-pill";
import { StatCard, SourceChip } from "@/components/ui/stat-card";
import { ErrorState, EmptyStateCard } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StickyActionBar } from "@/components/ui/sticky-action-bar";
import { TasarimInteractive } from "@/components/ui/tasarim-interactive";
import { Settings } from "lucide-react";

export const metadata = { title: "Tasarım sistemi" };
export const dynamic = "force-dynamic";

const COLOR_SWATCHES: { name: string; varName: string }[] = [
  { name: "bg", varName: "--c-bg" },
  { name: "surface-1", varName: "--c-surface-1" },
  { name: "surface-2", varName: "--c-surface-2" },
  { name: "surface-3", varName: "--c-surface-3" },
  { name: "text", varName: "--c-text" },
  { name: "text-muted", varName: "--c-text-muted" },
  { name: "brand", varName: "--c-brand" },
  { name: "action", varName: "--c-action" },
  { name: "ai", varName: "--c-ai" },
  { name: "success", varName: "--c-success" },
  { name: "danger", varName: "--c-danger" },
  { name: "warning", varName: "--c-warning" },
  { name: "info", varName: "--c-info" },
];

export default async function TasarimPage() {
  const { user } = await requireUser();
  const roles = await getUserRoles(user.id);
  if (!roles.includes("admin")) notFound();

  return (
    <main className="mx-auto max-w-5xl space-y-12 bg-bg px-4 py-10 text-[var(--c-text)]">
      <header className="space-y-2">
        <p className="text-12 font-semibold uppercase tracking-[0.08em] text-brand">Tasarım sistemi</p>
        <h1 className="font-display text-36">Cortex Plus bileşenleri</h1>
        <p className="max-w-2xl text-14 text-[var(--c-text-muted)]">
          Yalnız yönetici görür. Tokenlar ve durumlar tek bakışta denetlenir.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-22 font-semibold">Renkler</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {COLOR_SWATCHES.map((swatch) => (
            <div key={swatch.name} className="space-y-2">
              <div
                className="h-14 rounded-[var(--r-md)] border border-[var(--c-border)]"
                style={{ background: `var(${swatch.varName})` }}
              />
              <p className="text-12 font-medium">{swatch.name}</p>
              <p className="text-12 text-[var(--c-text-muted)]">{swatch.varName}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-22 font-semibold">Yazı</h2>
        <p className="font-display text-36">DM Serif Display — başlık</p>
        <p className="font-ui text-16">Figtree — gövde metni, 16px, satır 1.6</p>
        <p className="text-14 text-[var(--c-text-muted)]">Muted 14px</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-22 font-semibold">Butonlar</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary">Devam et</Button>
          <Button variant="secondary">İkincil</Button>
          <Button variant="ghost">Hayalet</Button>
          <Button variant="danger">Sil</Button>
          <Button variant="danger-ghost">Tehlike hayalet</Button>
          <Button variant="brand">Marka</Button>
          <Button variant="primary" loading loadingLabel="Yükleniyor…">
            Kaydet
          </Button>
          <Button variant="primary" disabled>
            Pasif
          </Button>
          <IconButton aria-label="Ayarlar">
            <Settings />
          </IconButton>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-22 font-semibold">Çipler</h2>
        <div className="flex flex-wrap gap-2">
          <Badge variant="neutral">Nötr</Badge>
          <Badge variant="brand">Marka</Badge>
          <Badge variant="action">Eylem</Badge>
          <Badge variant="success">Doğru</Badge>
          <Badge variant="warning">Uyarı</Badge>
          <Badge variant="danger">Hata</Badge>
          <Badge variant="info">Bilgi</Badge>
          <Chip variant="ai" kicker>
            AI
          </Chip>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-22 font-semibold">Kartlar</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>Varsayılan kart</Card>
          <Card variant="elevated">Yükseltilmiş</Card>
          <Card variant="hero">Kahraman kenarlık</Card>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-22 font-semibold">Şık kartı</h2>
        <div className="grid max-w-lg gap-2">
          <OptionCard index={0} label="İlk seçenek" state="idle" />
          <OptionCard index={1} label="Seçili" state="selected" selected />
          <OptionCard index={2} label="Doğru" state="correct" />
          <OptionCard index={3} label="Yanlış" state="incorrect" />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-22 font-semibold">İlerleme</h2>
        <ProgressSegments total={5} current={3} />
        <ProgressBar value={72} label="İlerleme" />
        <ProgressRing value={72}>
          <span className="text-14 font-semibold">72%</span>
        </ProgressRing>
        <div className="flex gap-2">
          <TimerPill remainingSeconds={12 * 60} />
          <TimerPill remainingSeconds={4 * 60} />
          <TimerPill remainingSeconds={45} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-22 font-semibold">Küre ve kontroller</h2>
        <TasarimInteractive />
      </section>

      <section className="space-y-4">
        <h2 className="text-22 font-semibold">Durumlar</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <StatCard label="Doğru" value="6/7" hint="Son deneme" />
          <SourceChip fileName="ders-notlari.pdf" page={12} />
          <EmptyStateCard
            title="Henüz bir şey yok"
            description="İlk belgeni yükleyerek başla."
            primary={{ href: "/dokumanlar", label: "Belgeler" }}
          />
          <ErrorState />
          <Skeleton className="h-20 w-full rounded-[var(--r-xl)]" />
        </div>
      </section>

      <StickyActionBar>
        <Button variant="secondary" block>
          İptal
        </Button>
        <Button variant="primary" block>
          Kaydet
        </Button>
      </StickyActionBar>
    </main>
  );
}
