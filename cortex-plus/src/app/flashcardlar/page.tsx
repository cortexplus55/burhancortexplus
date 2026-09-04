import { Layers } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { FlashcardGeneratePanel } from "@/components/learning/learning-generate-panels";
import { FlashcardDeck } from "@/components/learning/flashcard-deck";
import { EmptyState, SectionCard } from "@/components/ui-kit/empty-state";
import { requireUser } from "@/lib/auth/session";
import { getCreditCost } from "@/lib/credits/rules";

export const metadata = { title: "Flashcard" };

export default async function FlashcardlarPage() {
  const { supabase, user } = await requireUser();
  const cost = await getCreditCost("FLASHCARD_GENERATE");

  const { data: sets } = await supabase
    .from("flashcard_sets")
    .select("id, title, created_at, flashcards(id, front_text, back_text, sort_order)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <AppShell title="Flashcard" creditHint={`Kart seti üretimi: ${cost} kredi.`}>
      <div className="space-y-6">
        <SectionCard
          variant="astra"
          title="Yeni kart seti üret"
          description="Konu yaz, AI senin için çift yönlü kartlar hazırlasın."
        >
          <FlashcardGeneratePanel creditCost={cost} />
        </SectionCard>

        {sets?.length ? (
          <div className="space-y-4">
            {sets.map((set) => (
              <FlashcardDeck
                key={set.id}
                title={set.title}
                cards={(set.flashcards ?? [])
                  .slice()
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((card) => ({
                    id: card.id,
                    front: card.front_text,
                    back: card.back_text,
                  }))}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            variant="astra"
            icon={Layers}
            title="Henüz kart setin yok"
            description="Yukarıdan bir konu girerek ilk setini oluştur."
          />
        )}
      </div>
    </AppShell>
  );
}
