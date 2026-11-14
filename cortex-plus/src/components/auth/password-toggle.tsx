"use client";

import { Eye, EyeOff } from "lucide-react";

/*
  Şifre göster / gizle (Faz 7A). Düğme her zaman DOM'da ama yalnız `ui.v2.giris` açıkken görünür
  (`ui-v2-giris.css`): bayrak kapalıyken giriş ekranı eskisiyle aynı görünür ve aynı davranır.
  Düğme yalnız alanın türünü değiştirir; değer, doğrulama ve gönderim aynen.
*/
export function PasswordToggle({
  shown,
  onToggle,
  controls,
}: {
  shown: boolean;
  onToggle: () => void;
  controls: string;
}) {
  return (
    <button
      type="button"
      className="cx-pw-toggle"
      aria-label={shown ? "Şifreyi gizle" : "Şifreyi göster"}
      aria-pressed={shown}
      aria-controls={controls}
      onClick={onToggle}
    >
      {shown ? <EyeOff aria-hidden className="h-[18px] w-[18px]" /> : <Eye aria-hidden className="h-[18px] w-[18px]" />}
    </button>
  );
}
