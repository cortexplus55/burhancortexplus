import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { CalendarView } from "@/components/parity/calendar-view";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { buildCalendarItems } from "@/lib/learning/calendar";

export const metadata = { title: "Takvimim" };

export default async function TakvimimPage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const [{ data: events }, { data: preps }] = await Promise.all([
    supabase
      .from("calendar_events")
      .select("id, title, event_date, subject, note")
      .eq("user_id", user.id)
      .order("event_date"),
    // Sınav tarihleri kopyalanmaz; hazırlıklardan okunup görünüme çevrilir.
    supabase
      .from("exam_preps")
      .select("id, title, exam_type, exam_date")
      .eq("user_id", user.id)
      .not("exam_date", "is", null),
  ]);

  const items = buildCalendarItems(events ?? [], preps ?? []);

  return (
    <AstraParitySorShell {...shell}>
      <CalendarView items={items} />
    </AstraParitySorShell>
  );
}
