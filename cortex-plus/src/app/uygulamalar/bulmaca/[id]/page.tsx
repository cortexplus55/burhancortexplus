import { notFound } from "next/navigation";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { PuzzleShell } from "@/components/parity/puzzle-shell";
import {
  HanoiPuzzle,
  NonogramPuzzle,
  SudokuPuzzle,
} from "@/components/parity/puzzles";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import {
  DAILY_PUZZLES,
  puzzleDay,
  puzzleSeed,
  type PuzzleId,
} from "@/lib/parity/daily-puzzles";

export const metadata = { title: "Günün bulmacası" };

export default async function BulmacaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const puzzle = DAILY_PUZZLES.find((p) => p.id === id);
  if (!puzzle) notFound();

  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  // Tohum sunucuda hesaplanıyor: istemcinin saatine güvenirsek kullanıcı
  // tarihini değiştirip başka bir günün tahtasını oynayabilirdi.
  const seed = puzzleSeed(puzzle.id as PuzzleId, puzzleDay());

  return (
    <AstraParitySorShell {...shell}>
      <PuzzleShell
        puzzleId={puzzle.id}
        title={puzzle.title}
        blurb={puzzle.blurb}
      >
        {({ onSolved }) => {
          if (puzzle.id === "hanoi") {
            return <HanoiPuzzle seed={seed} onSolved={onSolved} />;
          }
          if (puzzle.id === "nonogram") {
            return <NonogramPuzzle seed={seed} onSolved={onSolved} />;
          }
          return <SudokuPuzzle seed={seed} onSolved={onSolved} />;
        }}
      </PuzzleShell>
    </AstraParitySorShell>
  );
}
