import { AppShell } from "@/components/layout/app-shell";
import { ImageSolver } from "@/components/learning/image-solver";
import { SectionCard } from "@/components/ui-kit/empty-state";
import { requireUser } from "@/lib/auth/session";
import { getCreditCost } from "@/lib/credits/rules";

export const metadata = { title: "Soru çöz" };

export default async function SoruCozPage() {
  await requireUser();
  const cost = await getCreditCost("IMAGE_SOLUTION");

  return (
    <AppShell title="Soru çöz" creditHint={`Her çözüm: ${cost} kredi.`}>
      <SectionCard
        title="Fotoğraftan soru çöz"
        description="Sorunun net bir fotoğrafını yükle; adım adım çözüm alırsın."
      >
        <ImageSolver creditCost={cost} />
      </SectionCard>
    </AppShell>
  );
}
