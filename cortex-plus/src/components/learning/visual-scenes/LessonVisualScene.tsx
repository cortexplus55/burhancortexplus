"use client";

import { useEffect, useRef, useState } from "react";
import { ARCHETYPE_LABEL } from "@/lib/learning/visual-scenes/archetype";
import { parseVisualScene, readAcademicDomain } from "@/lib/learning/visual-scenes/schema";
import { visualSceneText } from "@/lib/learning/visual-scenes/prompt";
import { VisualSceneRenderer } from "./index";

/**
 * Ders ekranındaki branşa özel görsel sahne (Faz 1-B). İki yerleşim de çizilir: geniş ekranda 16:9, dar ekranda
 * 9:16 (CSS seçer; sunucu ve istemci aynı çıktıyı verir). Çizim animasyonu sahne görünür olunca başlar.
 * Kayıttaki veri yeniden şemadan geçer; bozuksa hiçbir şey çizilmez (ekran kırılmaz).
 */
export function LessonVisualScene({ block, id }: { block: { scene?: unknown; visualArchetype?: unknown; academicDomain?: unknown }; id: string }) {
  const scene = parseVisualScene(block.scene, typeof block.visualArchetype === "string" ? (block.visualArchetype as never) : undefined);
  const domain = readAcademicDomain(block.academicDomain);
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  if (!scene) return null;
  return (
    <figure ref={ref} className="cp-vs-lesson" aria-label={`${ARCHETYPE_LABEL[scene.archetype]}: ${scene.title}`} data-archetype={scene.archetype} id={id}>
      <div className="cp-vs-lesson-landscape">
        <VisualSceneRenderer scene={scene} mode="16:9" chrome="lesson" domain={domain} animate="sync" playing={visible} />
      </div>
      <div className="cp-vs-lesson-portrait">
        <VisualSceneRenderer scene={scene} mode="9:16" chrome="lesson" domain={domain} animate="sync" playing={visible} />
      </div>
      <figcaption className="sr-only">{visualSceneText(scene)}</figcaption>
    </figure>
  );
}
