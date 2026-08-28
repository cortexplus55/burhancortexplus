"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateProfile } from "@/app/actions";
import {
  PARENT_RELATION_OPTIONS,
  isOptionalPhoneValid,
  type ParentRelation,
} from "@/lib/parity/signup";
import { cn } from "@/lib/utils";

export function ParentProfileForm({
  fullName,
  locale,
  parentRelation,
  phone,
}: {
  fullName: string;
  locale: "tr" | "en";
  parentRelation: ParentRelation | null;
  phone: string;
}) {
  const [pending, startTransition] = useTransition();
  const [selectedLocale, setSelectedLocale] = useState(locale);
  const [relation, setRelation] = useState<ParentRelation | "">(
    parentRelation ?? "",
  );
  const [phoneValue, setPhoneValue] = useState(phone);

  const phoneOk = isOptionalPhoneValid(phoneValue);

  return (
    <form
      className="space-y-5"
      action={(formData) => {
        startTransition(async () => {
          const result = await updateProfile(formData);
          if (result.ok) toast.success("Profil güncellendi.");
          else toast.error(result.error ?? "Kaydedilemedi.");
        });
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor="fullName" className="text-sm font-medium">
          Ad soyad
        </label>
        <input
          id="fullName"
          name="fullName"
          defaultValue={fullName}
          required
          minLength={2}
          className="w-full rounded-xl border border-[var(--astra-border)] bg-[var(--astra-bg)] px-3 py-2.5 text-sm"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Yakınlık</legend>
        <div className="space-y-2">
          {PARENT_RELATION_OPTIONS.map((option) => (
            <label
              key={option.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-2xl border p-3 text-sm",
                relation === option.id
                  ? "border-amber-400/70 bg-amber-500/10"
                  : "border-[var(--astra-border)]",
              )}
            >
              <input
                type="radio"
                name="parentRelation"
                value={option.id}
                checked={relation === option.id}
                onChange={() => setRelation(option.id)}
                className="mt-1 accent-[#e8a838]"
                required
              />
              <span>
                <span className="block font-medium">{option.title}</span>
                <span className="block text-xs text-[var(--astra-muted)]">
                  {option.body}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="phone" className="text-sm font-medium">
          Telefon <span className="font-normal text-[var(--astra-muted)]">(isteğe bağlı)</span>
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          value={phoneValue}
          onChange={(event) => setPhoneValue(event.target.value)}
          placeholder="05xx xxx xx xx"
          className="w-full rounded-xl border border-[var(--astra-border)] bg-[var(--astra-bg)] px-3 py-2.5 text-sm"
        />
        <p className="text-xs text-[var(--astra-muted)]">
          SMS gönderilmez; yalnızca hesapta saklanır.
        </p>
        {!phoneOk ? (
          <p className="text-xs text-red-300">10–15 haneli bir numara gir.</p>
        ) : null}
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
                className="accent-[#e8a838]"
              />
              {option === "tr" ? "Türkçe" : "English"}
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={pending || !relation || !phoneOk}
        className="astra-btn-primary w-full rounded-full py-3 text-sm font-semibold disabled:opacity-60"
      >
        {pending ? "Kaydediliyor…" : "Kaydet"}
      </button>
    </form>
  );
}
