"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateClassForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/student/create-class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Sınıf oluşturulamadı.");
        return;
      }
      toast.success(`Sınıf hazır. Katılım kodu: ${payload.joinCode}`);
      setName("");
      router.refresh();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="astra-pay-card space-y-3 p-4">
      <div className="space-y-2">
        <Label htmlFor="class-name">Çalışma grubu adı</Label>
        <Input
          id="class-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Örn. Trigonometri grubu"
          required
          minLength={2}
        />
      </div>
      <Button type="submit" disabled={loading || name.trim().length < 2}>
        Sınıf oluştur
      </Button>
    </form>
  );
}
