import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ListChecks,
  RotateCcw,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { requireStudentArea } from "@/lib/auth/session";
import { parseExamAnalysis } from "@/lib/learning/exam-analysis";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";

export const metadata = { title: "Sınav Sonucu · Astra AI" };

export default async function ExamPrepSonucPage({
  params,
  searchParams,
}: {
  params: Promise<{ prepId: string }>;
  searchParams: Promise<{ examId?: string; score?: string }>;
}) {
  const { prepId } = await params;
  const query = await searchParams;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const { data: latestLesson } = await supabase
    .from("exam_prep_lessons")
    .select("id, title")
    .eq("exam_prep_id", prepId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let analysisRaw = "";
  let attemptScore: number | null = null;
  if (query.examId) {
    const { data: attempt } = await supabase
      .from("practice_exam_attempts")
      .select("analysis, score")
      .eq("exam_id", query.examId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    analysisRaw = (attempt?.analysis as string) ?? "";
    attemptScore = attempt?.score ?? null;
  }

  const analysis = parseExamAnalysis(analysisRaw);
  const scoreNum = query.score != null ? parseInt(query.score, 10) : attemptScore;
  const scoreLabel = scoreNum != null && !isNaN(scoreNum) ? String(scoreNum) : "—";

  const getTierInfo = (score: number | null) => {
    if (score == null || isNaN(score)) {
      return {
        label: "Tamamlandı",
        color: "text-violet-400",
        badge: "bg-violet-500/15 border-violet-500/30 text-violet-300",
      };
    }
    if (score >= 80) {
      return {
        label: "Harika Başarı",
        color: "text-emerald-400",
        badge: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
      };
    }
    if (score >= 50) {
      return {
        label: "İyi Performans",
        color: "text-amber-400",
        badge: "bg-amber-500/15 border-amber-500/30 text-amber-300",
      };
    }
    return {
      label: "Tekrar & Pratik Gerekli",
      color: "text-rose-400",
      badge: "bg-rose-500/15 border-rose-500/30 text-rose-300",
    };
  };

  const tier = getTierInfo(scoreNum);

  return (
    <AstraParitySorShell {...shell}>
      <div className="ap-exam-suite-container max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Top Back Navigation */}
        <div className="flex items-center justify-between">
          <Link
            href={`/deneme-sinavlari/${prepId}`}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 text-xs font-medium text-zinc-300 hover:text-white transition-all shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Konu yoluna dön</span>
          </Link>
        </div>

        {/* Score Hero Banner */}
        <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#181928]/95 to-[#10111a]/95 backdrop-blur-2xl p-8 sm:p-10 shadow-2xl relative overflow-hidden text-center">
          {/* Ambient Glow */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-violet-600/15 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 space-y-4 max-w-lg mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/25 text-xs font-bold text-violet-300">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Sınav Değerlendirmesi</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Deneme Sınavı Tamamlandı
            </h1>

            {/* Score Ring / Display */}
            <div className="py-4">
              <div className="inline-flex flex-col items-center justify-center w-36 h-36 sm:w-40 sm:h-40 rounded-full bg-zinc-900/90 border-2 border-violet-500/30 shadow-[0_0_35px_rgba(124,108,247,0.3)]">
                <span className={`text-4xl sm:text-5xl font-black ${tier.color}`}>
                  {scoreLabel}
                </span>
                <span className="text-xs uppercase tracking-widest text-zinc-400 font-semibold mt-1">
                  Puan
                </span>
              </div>
            </div>

            {/* Tier Status Badge */}
            <div>
              <span
                className={`inline-block px-4 py-1.5 rounded-full border text-xs font-bold uppercase tracking-wider ${tier.badge}`}
              >
                {tier.label}
              </span>
            </div>
          </div>
        </div>

        {/* AI Performance Analysis & Insights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Summary Box */}
          <div className="rounded-3xl border border-white/10 bg-zinc-900/80 backdrop-blur-xl p-6 sm:p-7 shadow-xl space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-white/5">
              <div className="w-8 h-8 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-300">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Yapay Zeka Özeti</h2>
                <p className="text-xs text-zinc-400">Performansının detaylı dökümü</p>
              </div>
            </div>

            <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
              {analysis.summary || "Sınav analiziniz başarıyla oluşturuldu."}
            </p>
          </div>

          {/* Weak Topics & Focus Areas */}
          <div className="rounded-3xl border border-white/10 bg-zinc-900/80 backdrop-blur-xl p-6 sm:p-7 shadow-xl space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-white/5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300">
                <Target className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Odaklanılacak Alanlar</h2>
                <p className="text-xs text-zinc-400">Geliştirilmesi gereken konular</p>
              </div>
            </div>

            {analysis.weakTopics.length ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {analysis.weakTopics.map((topic) => (
                  <span
                    key={topic}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs font-semibold text-amber-300"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    {topic}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-400 italic">
                Tebrikler! Belirgin bir zayıf nokta tespit edilmedi.
              </p>
            )}
          </div>
        </div>

        {/* Next Steps Checklist */}
        {analysis.nextSteps.length ? (
          <div className="rounded-3xl border border-white/10 bg-zinc-900/80 backdrop-blur-xl p-6 sm:p-7 shadow-xl space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-white/5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-300">
                <ListChecks className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Önerilen Sonraki Adımlar</h2>
                <p className="text-xs text-zinc-400">Hedefine ulaşmak için çalışma planı</p>
              </div>
            </div>

            <div className="space-y-3">
              {analysis.nextSteps.map((step, idx) => (
                <div
                  key={step}
                  className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-zinc-800/40 border border-white/5"
                >
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">
                    {idx + 1}
                  </div>
                  <span className="text-sm text-zinc-200 leading-snug">{step}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Action Buttons Hub */}
        <div className="rounded-3xl border border-white/10 bg-zinc-900/90 backdrop-blur-xl p-6 shadow-2xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {query.examId ? (
              <Link
                href={`/deneme-sinavlari/${prepId}/deneme/${query.examId}/incele`}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/30 active:scale-95 transition-all w-full sm:w-auto"
              >
                <ListChecks className="w-4 h-4" />
                <span>Soruları İncele</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : null}

            {query.examId ? (
              <Link
                href={`/deneme-sinavlari/${prepId}/deneme/${query.examId}`}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-white/5 active:scale-95 transition-all w-full sm:w-auto"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Tekrar Çöz</span>
              </Link>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {latestLesson ? (
              <Link
                href={`/deneme-sinavlari/${prepId}/ders/${latestLesson.id}`}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-white/5 active:scale-95 transition-all w-full sm:w-auto"
              >
                <BookOpen className="w-4 h-4" />
                <span>Dersi Oku</span>
              </Link>
            ) : null}

            <Link
              href={`/deneme-sinavlari/${prepId}`}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-white/5 active:scale-95 transition-all w-full sm:w-auto"
            >
              <span>Konu Yoluna Dön</span>
            </Link>
          </div>
        </div>
      </div>
    </AstraParitySorShell>
  );
}
