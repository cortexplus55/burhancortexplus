import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  Bell,
  CalendarClock,
  Clapperboard,
  CreditCard,
  Gauge,
  GraduationCap,
  Headphones,
  Receipt,
  ShieldCheck,
  Target,
} from "lucide-react";

/** Bildirim türünün simgesi (Faz 6, 20 Kasım 2026). Çan ve /bildirimler aynı eşlemeyi kullanır; bilinmeyen tür çan. */
const ICONS: Record<string, LucideIcon> = {
  video_ready: Clapperboard,
  podcast_ready: Headphones,
  topic_learned: GraduationCap,
  blind_spot_detected: Target,
  quota_80_pct: Gauge,
  study_reminder: AlarmClock,
  plan_notice: CalendarClock,
  payment: CreditCard,
  refund: Receipt,
  account: ShieldCheck,
};

export function NotificationKindIcon({ kind, className }: { kind: string; className?: string }) {
  const Icon = ICONS[kind] ?? Bell;
  return <Icon className={className} aria-hidden />;
}
