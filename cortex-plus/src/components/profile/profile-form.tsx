"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile } from "@/app/actions";
import {
  TUTOR_STYLE_OPTIONS,
  type TutorStyle,
} from "@/lib/learning/tutor-style";
import { cn } from "@/lib/utils";

export function ProfileForm({
  fullName,
  gradeLevel,
  locale,
  tutorStyle,
}: {
  fullName: string;
  gradeLevel: string;
  locale: "tr" | "en";
  tutorStyle: TutorStyle;
}) {
  const [pending, startTransition] = useTransition();
  const [selectedStyle, setSelectedStyle] = useState(tutorStyle);

  return (
    <form
      className="max-w-md space-y-4"
      action={(formData) => {
        startTransition(async () => {
          formData.set("tutorStyle", selectedStyle);
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
        <legend className="text-sm font-medium">AI öğretmen stili</legend>
        <div className="space-y-2">
          {TUTOR_STYLE_OPTIONS.map((option) => (
            <label
              key={option.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm",
                selectedStyle === option.id
                  ? "border-[var(--cs-primary)] bg-[var(--cs-primary)]/10"
                  : "border-[var(--cs-border)]",
              )}
            >
              <input
                type="radio"
                name="tutorStyleChoice"
                value={option.id}
                checked={selectedStyle === option.id}
                onChange={() => setSelectedStyle(option.id)}
                className="mt-1 accent-[hsl(var(--primary))]"
              />
              <span>
                <span className="block font-medium">{option.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {option.body}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/*
        "Arayüz dili" seçimi kaldırıldı: English kaydediliyordu ama hiçbir
        sayfa `locale`'i okumuyor, arayüz Türkçe kalıyordu. Kayıtlı değer
        olduğu gibi geri gönderiliyor; çeviri gelene kadar seçenek yok.
      */}
      <input type="hidden" name="locale" value={locale} />

      <Button type="submit" disabled={pending}>
        {pending ? "Kaydediliyor…" : "Kaydet"}
      </Button>
    </form>
  );
}
