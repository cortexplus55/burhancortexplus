"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function ClassroomSharePrep({
  classroomId,
  preps,
}: {
  classroomId: string;
  preps: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [prepId, setPrepId] = useState(preps[0]?.id ?? "");
  const [saving, setSaving] = useState(false);

  if (!preps.length) return null;

  async function share() {
    if (!prepId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/student/classroom-share-prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classroomId, prepId }),
      });
      if (!res.ok) {
        toast.error("Hazırlık eklenemedi.");
        return;
      }
      toast.success("Sınav hazırlığı sınıfa eklendi.");
      router.refresh();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ap-class-share">
      <select
        value={prepId}
        onChange={(e) => setPrepId(e.target.value)}
        aria-label="Sınıfa eklenecek hazırlık"
      >
        {preps.map((prep) => (
          <option key={prep.id} value={prep.id}>
            {prep.title}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="ap-chip"
        disabled={saving}
        onClick={() => void share()}
      >
        {saving ? "Ekleniyor…" : "Sınıfa ekle"}
      </button>
    </div>
  );
}
