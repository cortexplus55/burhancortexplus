"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function JoinClassForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/student/join-class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.status === 403 && payload.error === "teacher_student_limit") {
        toast.error(payload.message ?? "Sınıf dolu.");
        return;
      }
      if (!res.ok) {
        toast.error(
          payload.error === "not_found"
            ? "Katılım kodu bulunamadı."
            : "Katılım başarısız.",
        );
        return;
      }
      toast.success(
        payload.already
          ? "Zaten bu sınıftasın."
          : `${payload.classroomName ?? "Sınıf"}a katıldın.`,
      );
      setCode("");
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
        <Label htmlFor="join-code">Katılım kodu</Label>
        <Input
          id="join-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Örn. A1B2C3"
          required
          minLength={4}
          className="uppercase"
        />
      </div>
      <Button type="submit" disabled={loading || code.trim().length < 4}>
        Sınıfa katıl
      </Button>
    </form>
  );
}
