"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { Icon3D } from "@/components/ui/icon-3d";
import {
  FIRST_STEP_SOLVE_HREF,
  FIRST_STEP_UPLOAD_HREF,
  firstStepGreeting,
  firstStepPlan,
} from "@/lib/student/first-step";
import "@/styles/first-step-launcher.css";

const HIDE_KEY = "cp:first-step:hidden";

/**
 * Ana sayfada, henüz hazırlığı olmayan öğrenciye kişiselleştirilmiş ilk adım (7 Kasım 2026; 19 Ekim'deki tek kartın
 * yerine). Başlık öğrencinin sınıfı ve hedef sınavıyla; üç büyük kapı: notunu yükle, hazır müfredattan başla (düzeyine
 * göre ders çipleri), çözemediğin soruyu çek. "Şimdilik gizle" yalnız bu sekme oturumu için; ilk hazırlık kurulunca
 * kart zaten görünmez. Sohbet kutusu altta durur, engellenmez.
 */
export function FirstStepLauncher({
  firstName,
  gradeLevel,
  goalText,
}: {
  firstName?: string | null;
  gradeLevel?: string | null;
  goalText?: string | null;
}) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(HIDE_KEY) === "1") setHidden(true);
    } catch {
      /* depolama kapalıysa kart her zaman görünür */
    }
  }, []);
  if (hidden) return null;

  const plan = firstStepPlan({ gradeLevel, goalText });

  function hide() {
    setHidden(true);
    try {
      sessionStorage.setItem(HIDE_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="cp-first-step" aria-labelledby="cp-first-step-title">
      <div className="cp-first-step-head">
        <h2 id="cp-first-step-title" className="cp-first-step-title">
          {firstStepGreeting(firstName, plan.targetLabel)}
        </h2>
        <button type="button" className="cp-first-step-hide" onClick={hide} aria-label="Şimdilik gizle">
          <X className="h-4 w-4" aria-hidden />
          <span>Şimdilik gizle</span>
        </button>
      </div>

      <div className="cp-first-step-grid">
        <Link href={FIRST_STEP_UPLOAD_HREF} className="cp-first-step-card">
          <Icon3D name="bos-belge" size={44} />
          <strong>{"📄 Kendi ders notunu, PDF'ini ya da fotoğrafını yükle"}</strong>
          <span>Defter fotoğrafını, hocanın slaytını ya da çıkmış soruları yükle; notundaki kurallara birebir sadık bir çalışma yolu kuralım.</span>
          <em>
            Notunu yükle <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </em>
        </Link>

        <div className="cp-first-step-card cp-first-step-card--curriculum">
          <Icon3D name="mufredat" size={44} />
          <strong>⚡ Dosya yüklemeden hazır müfredatla başla</strong>
          <span>{plan.curriculumBody}</span>
          {plan.chips.length ? (
            <div className="cp-first-step-chips" aria-label="Hızlı ders seçimi">
              {plan.chips.map((chip) => (
                <Link key={chip.label} href={chip.href} className="cp-first-step-chip">
                  {chip.label}
                </Link>
              ))}
            </div>
          ) : null}
          <Link href={plan.curriculumHref} className="cp-first-step-main">
            Müfredattan başla <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>

        <Link href={FIRST_STEP_SOLVE_HREF} className="cp-first-step-card">
          <Icon3D name="alistirma" size={44} />
          <strong>📸 Çözemediğin sorunun fotoğrafını çek</strong>
          <span>Takıldığın soruyu ya da kendi el yazısı çözümünü yükle; nerede hata yaptığını satır satır bulalım.</span>
          <em>
            Soruyu çöz <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </em>
        </Link>
      </div>
    </section>
  );
}
