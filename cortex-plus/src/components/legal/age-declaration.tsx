"use client";

import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import type { AgeDeclaration } from "@/lib/legal/consent-evidence";
import "@/styles/legal-consent.css";

export type AgeValue = { minor: boolean | null; guardianAck: boolean };

export const EMPTY_AGE: AgeValue = { minor: null, guardianAck: false };

/** Tamamlanmış beyan ya da `null` (yaş seçilmedi). Velinin izni kutusunu `ageProblem` ayrıca denetler. */
export function ageDeclarationOf(value: AgeValue): AgeDeclaration | null {
  if (value.minor === null) return null;
  return { minor: value.minor, guardianAck: value.minor ? value.guardianAck : false };
}

/*
  Yaş beyanı (7 Kasım 2026, uyum paketi). Kurul'un çocuk verisi rehberi: çocuğa hizmet veren site yaşı sormalı ve
  18 yaşından küçük kullanıcı için velinin bilgisini almalı. Sınıftan tahmin edilmez (12. sınıf ya da mezun
  17 de olabilir 19 da); öğrenci tek dokunuşla söyler. 18 yaşından küçükse velinin izni kutusu zorunlu olur.
  Seçim önceden yapılmaz: önceden işaretli bir beyan beyan değildir.
*/
export function AgeDeclarationField({
  value,
  onChange,
}: {
  value: AgeValue;
  onChange: (next: AgeValue) => void;
}) {
  const name = useId();
  return (
    <fieldset className="cp-age">
      <legend className="cp-age-legend">Yaşın</legend>
      <div className="cp-age-choices">
        <label className="cp-age-choice">
          <input
            type="radio"
            name={name}
            checked={value.minor === true}
            onChange={() => onChange({ minor: true, guardianAck: value.guardianAck })}
          />
          <span>18 yaşından küçüğüm</span>
        </label>
        <label className="cp-age-choice">
          <input
            type="radio"
            name={name}
            checked={value.minor === false}
            onChange={() => onChange({ minor: false, guardianAck: false })}
          />
          <span>18 yaşında ya da büyüğüm</span>
        </label>
      </div>
      {value.minor ? (
        <label className="cp-legal-row cp-age-guardian">
          <Checkbox
            aria-label="Velim bu metinleri okudu ve hesap açmama izin verdi"
            className="mt-0.5 size-5 border-[var(--c-text-subtle)]"
            checked={value.guardianAck}
            onCheckedChange={(checked) => onChange({ minor: true, guardianAck: checked === true })}
          />
          <span className="cp-legal-row-text">
            Velim (annem, babam ya da yasal temsilcim) bu metinleri okudu ve hesap açmama izin verdi.
          </span>
        </label>
      ) : null}
    </fieldset>
  );
}
