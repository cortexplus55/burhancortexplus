"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TeacherApplicationForm() {
  const router = useRouter();
  const [institution, setInstitution] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const form = new FormData();
      form.append("institution", institution);
      if (file) form.append("document", file);

      const res = await fetch("/api/teacher/apply", { method: "POST", body: form });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error ?? "Başvuru gönderilemedi.");
        return;
      }
      toast.success("Başvurun kaydedildi. Sonucu bildirimlerden takip edebilirsin.");
      router.refresh();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-4">
      <div className="space-y-2">
        <Label htmlFor="institution">Kurum</Label>
        <Input
          id="institution"
          value={institution}
          onChange={(event) => setInstitution(event.target.value)}
          placeholder="Örn. Atatürk Anadolu Lisesi"
          required
          minLength={2}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="teacher-document">Doğrulama belgesi</Label>
        <Input
          id="teacher-document"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <p className="text-xs text-muted-foreground">
          Kurum kimliği veya görevlendirme yazısı · en fazla 10 MB
        </p>
      </div>

      <Button type="submit" disabled={loading || institution.length < 2}>
        {loading ? "Gönderiliyor…" : "Belgeyi kaydet"}
      </Button>
    </form>
  );
}
