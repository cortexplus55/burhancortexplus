import Link from "next/link";

export function TeacherPlusGate({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="astra-pay-card mt-4 rounded-2xl border border-dashed border-[var(--astra-border)] p-5 text-center">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-[var(--astra-muted)]">{description}</p>
      <Link
        href="/ogretmen-paneli/plus"
        className="astra-btn-primary mt-4 inline-flex rounded-full px-6 py-2.5 text-sm font-semibold"
      >
        Cortex Plus
      </Link>
    </div>
  );
}
