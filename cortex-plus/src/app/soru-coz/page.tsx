import { AppShell } from "@/components/layout/app-shell";
import { ImageSolver } from "@/components/learning/image-solver";
import { requireUser } from "@/lib/auth/session";
import { getCreditCost } from "@/lib/credits/rules";
import { Camera } from "lucide-react";
import "@/styles/cortex-premium.css";

export const metadata = { title: "Soru çöz" };

export default async function SoruCozPage() {
  await requireUser();
  const cost = await getCreditCost("IMAGE_SOLUTION");

  return (
    <AppShell title="Soru çöz" creditHint={`Her çözüm: ${cost} kredi.`}>
      <div className="cortex-premium space-y-4">
        <div className="cortex-premium-tool-card relative overflow-hidden p-6">
          <div
            className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[var(--cx-gold-glow)] opacity-30 blur-3xl"
            aria-hidden
          />
          <div className="relative flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f0b84d] to-[#c9851f] text-[#0c0a06]">
              <Camera className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-[var(--cx-text)]">
                Fotoğraftan soru çöz
              </h2>
              <p className="mt-1 text-sm text-[var(--cx-muted)]">
                Sorunun net bir fotoğrafını yükle; adım adım çözüm alırsın. Gelişmiş
                model kullanılır ({cost} kredi).
              </p>
            </div>
          </div>
          <div className="relative mt-5 rounded-2xl border border-dashed border-[var(--cx-border-gold)] bg-black/25 p-4">
            <ImageSolver creditCost={cost} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
