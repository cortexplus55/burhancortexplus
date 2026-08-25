"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile } from "@/app/actions";

export function ProfileForm({
  fullName,
  gradeLevel,
  locale,
}: {
  fullName: string;
  gradeLevel: string;
  locale: "tr" | "en";
}) {
  const [pending, startTransition] = useTransition();
  const [selectedLocale, setSelectedLocale] = useState(locale);

  return (
    <form
      className="max-w-md space-y-4"
      action={(formData) => {
        startTransition(async () => {
          const result = await updateProfile(formData);
          if (result.ok) toast.success("Profil güncellendi.");
          else toast.error(result.error ?? "Kaydedilemedi.");
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="fullName">Ad soyad</Label>
        <Input id="fullName" name="fullName" defaultValue={fullName} required minLength={2} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="gradeLevel">Sınıf / seviye</Label>
        <Input id="gradeLevel" name="gradeLevel" defaultValue={gradeLevel} />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Arayüz dili</legend>
        <div className="flex gap-4 text-sm">
          {(["tr", "en"] as const).map((option) => (
            <label key={option} className="flex items-center gap-2">
              <input
                type="radio"
                name="locale"
                value={option}
                checked={selectedLocale === option}
                onChange={() => setSelectedLocale(option)}
                className="accent-[hsl(var(--primary))]"
              />
              {option === "tr" ? "Türkçe" : "English"}
            </label>
          ))}
        </div>
      </fieldset>

      <Button type="submit" disabled={pending}>
        {pending ? "Kaydediliyor…" : "Kaydet"}
      </Button>
    </form>
  );
}
