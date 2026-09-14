"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Download, FileText, Loader2, Upload } from "lucide-react";
import {
  sha256Hex,
  verdictFor,
  type SourceVerdict,
} from "@/lib/demo/source-check";
import type { DemoPipeline } from "@/lib/demo/lesson";

/**
 * Örnek akışın ilk adımı: notu indir, geri bırak, işlenişini gör.
 *
 * Yükleme gerçek bir hareket ama dosya sunucuya gitmiyor — özeti tarayıcıda
 * hesaplanıp bizim örnek notumuzla karşılaştırılıyor (`source-check.ts`
 * bunun neden böyle olduğunu anlatıyor). Gösterilen sayılar da uydurma
 * değil: üretimin kendi parçalayıcısından geliyor.
 *
 * Ziyaretçi hiçbir yerde kilitlenmiyor. Başka bir PDF bıraktığında ne olduğu
 * söyleniyor ve iki yol veriliyor: örnekle devam etmek ya da hesap açmak.
 * Bir huni sayfasında çıkmaz sokak, yanlış dosyadan pahalıdır.
 */

type Phase = "idle" | "checking" | "processing" | "done";

const STAGE_MS = 420;

export function SourceUpload({
  name,
  href,
  text,
  pipeline,
  accepted,
  onAccepted,
}: {
  name: string;
  href: string;
  text: string;
  pipeline: DemoPipeline;
  accepted: boolean;
  onAccepted: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(accepted ? "done" : "idle");
  const [stagesShown, setStagesShown] = useState(accepted ? 3 : 0);
  const [verdict, setVerdict] = useState<SourceVerdict | null>(null);
  const [droppedName, setDroppedName] = useState("");
  const [dragging, setDragging] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const stages = useMemo(
    () => [
      {
        label: "Metin çıkarıldı",
        detail: `${pipeline.pages} sayfa · ${pipeline.characters} karakter`,
      },
      { label: "Aranabilir parçalara ayrıldı", detail: `${pipeline.chunks} parça` },
      { label: "Konu haritası çıkarıldı", detail: `${pipeline.topics} konu` },
    ],
    [pipeline.pages, pipeline.characters, pipeline.chunks, pipeline.topics],
  );

  const runStages = useCallback(() => {
    setPhase("processing");
    setStagesShown(0);

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      setStagesShown(stages.length);
      setPhase("done");
      onAccepted();
      return;
    }

    stages.forEach((_, i) => {
      timers.current.push(
        setTimeout(() => setStagesShown(i + 1), STAGE_MS * (i + 1)),
      );
    });
    timers.current.push(
      setTimeout(
        () => {
          setPhase("done");
          onAccepted();
        },
        STAGE_MS * (stages.length + 1),
      ),
    );
  }, [onAccepted, stages]);

  const handleFile = useCallback(
    async (file: File) => {
      setDroppedName(file.name);
      setPhase("checking");

      const sha256 = await sha256Hex(await file.arrayBuffer());
      const result = verdictFor({
        name: file.name,
        type: file.type,
        size: file.size,
        sha256,
      });
      setVerdict(result);

      if (result === "match") runStages();
      else setPhase("idle");
    },
    [runStages],
  );

  const busy = phase === "checking" || phase === "processing";

  return (
    <div className="dm-source">
      <a className="dm-file pm-card pm-card--interactive" href={href} download>
        <Download className="h-5 w-5" aria-hidden />
        <span>
          <strong>{name}</strong>
          <em>Örnek ders notunu indir · PDF</em>
        </span>
      </a>

      {phase === "idle" || phase === "checking" ? (
        <>
          <label
            className={`dm-drop${dragging ? " is-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
          >
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="dm-drop-input"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
            {phase === "checking" ? (
              <>
                <Loader2 className="h-6 w-6 dm-spin" aria-hidden />
                <strong>{droppedName} okunuyor…</strong>
                <em>Dosya bilgisayarından çıkmıyor; özeti burada hesaplanıyor.</em>
              </>
            ) : (
              <>
                <Upload className="h-6 w-6" aria-hidden />
                <strong>İndirdiğin notu buraya bırak</strong>
                <em>ya da tıklayıp seç · yalnızca PDF</em>
              </>
            )}
          </label>

          {verdict === "not-pdf" ? (
            <p className="dm-drop-msg" role="status">
              <strong>{droppedName}</strong> bir PDF değil. İndirdiğin örnek notu bırak.
            </p>
          ) : null}

          {verdict === "other-pdf" ? (
            <div className="dm-drop-msg" role="status">
              <p>
                <strong>{droppedName}</strong> bizim örnek notumuz değil. Bu deneme
                tek bir örnek notla çalışıyor — kendi notunla çalışmak ücretsiz
                hesapla açılıyor.
              </p>
              <div className="dm-drop-msg-acts">
                <button type="button" className="dm-btn dm-btn--sm" onClick={runStages}>
                  Örnek notla devam et
                </button>
                <Link href="/kayit" className="dm-btn dm-btn--primary dm-btn--sm">
                  Kendi notumla dene
                </Link>
              </div>
            </div>
          ) : null}

          {verdict === null ? (
            <button type="button" className="dm-skip" onClick={runStages}>
              Yüklemeden geç
            </button>
          ) : null}
        </>
      ) : null}

      {phase === "processing" || phase === "done" ? (
        <ol className="dm-stages" aria-live="polite">
          {stages.map((s, i) => (
            <li key={s.label} className={i < stagesShown ? "is-done" : ""}>
              <span className="dm-stages-dot" aria-hidden>
                {i < stagesShown ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Loader2 className="h-3.5 w-3.5 dm-spin" />
                )}
              </span>
              <span className="dm-stages-label">{s.label}</span>
              {i < stagesShown ? <em className="dm-stages-detail">{s.detail}</em> : null}
            </li>
          ))}
        </ol>
      ) : null}

      {phase === "done" ? (
        <>
          <p className="dm-source-kicker">
            <FileText className="h-4 w-4" aria-hidden /> Çıkarılan metin
          </p>
          <div className="dm-source-text">{text}</div>
          <p className="dm-source-note">
            Bu örneğin dersi, podcast’i ve soruları bir kez üretilip kaydedildi;
            sayfa hiçbir üretim yapmıyor. Kendi notunda bu adımlar sana özel çalışır.
          </p>
        </>
      ) : null}
    </div>
  );
}
