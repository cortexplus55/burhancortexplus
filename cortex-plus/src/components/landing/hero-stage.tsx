import { Check, Lock } from "lucide-react";
import { heroStageFor, type AudienceSegmentId } from "@/lib/marketing/landing-showcase";
import { cn } from "@/lib/utils";

/**
 * Kahraman sahnesi: solda notun sayfası (bir ışık satırları okur), ortada dersin "önce dene" ekranı,
 * sağda hazırlık yolu ve "+%X kazandın" kartı. Telefonda yalnız ders ekranı ve kazanç kartı kalır.
 * İçerik seçili hedef kitle sekmesinden gelir (10 Kasım 2026): lise sekmesinde lise notu, üniversite
 * sekmesinde ders slaytı görünür.
 */
export function HeroStage({ segmentId }: { segmentId: AudienceSegmentId }) {
  const { note, lesson, path, gain } = heroStageFor(segmentId);
  return (
    <div className="lp-stage" aria-label="Notundan derse: ürün ekranlarından bir sahne" role="img" data-segment={segmentId}>
      <div className="lp-stage-note lp-float" aria-hidden>
        <div className="lp-note-head">
          <span className="lp-note-pdf">{note.badge}</span>
          <span>{note.file}</span>
        </div>
        <p className="lp-note-heading">{note.heading}</p>
        <span className="lp-note-line" style={{ width: "92%" }} />
        <span className="lp-note-line" style={{ width: "78%" }} />
        <span className="lp-note-line" style={{ width: "86%" }} />
        <div className="lp-note-tip">
          <span>SINAV İPUCU</span>
          <p>{note.tip}</p>
        </div>
        <span className="lp-note-line" style={{ width: "70%" }} />
        <span className="lp-note-line" style={{ width: "88%" }} />
        <span className="lp-note-line" style={{ width: "54%" }} />
        <span className="lp-note-scan" />
      </div>

      <svg className="lp-beam lp-beam--left" viewBox="0 0 200 120" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="lp-beam-l" x1="0" x2="1">
            <stop offset="0" stopColor="#ffb27a" stopOpacity="0" />
            <stop offset=".5" stopColor="#ffb27a" stopOpacity=".55" />
            <stop offset="1" stopColor="#8e98ff" stopOpacity=".7" />
          </linearGradient>
        </defs>
        <path d="M0 90 C 70 90, 120 30, 200 30" stroke="url(#lp-beam-l)" strokeWidth="1.5" fill="none" />
        <path d="M0 90 C 70 90, 120 30, 200 30" className="lp-beam-pulse" fill="none" />
      </svg>

      <figure className="lp-phone" aria-label="Ders ekranı örneği">
        <div className="lp-phone-screen">
          <span className="lp-phone-notch" aria-hidden />
          <div className="lp-phone-top">
            <span className="lp-phone-progress">
              <span style={{ width: "34%" }} />
            </span>
            <span className="lp-phone-x" aria-hidden>
              ×
            </span>
          </div>
          <p className="lp-phone-topic">{lesson.topic}</p>
          <p className="lp-phone-kicker">Önce dene · Doğru mu, yanlış mı?</p>
          <p className="lp-phone-prompt">{lesson.prompt}</p>
          <div className="lp-phone-options">
            <span className="lp-option">Doğru</span>
            <span className="lp-option lp-option--right">
              Yanlış
              <Check className="h-4 w-4" aria-hidden />
            </span>
          </div>
          <div className="lp-phone-answer">
            <p className="lp-phone-answer-title">Doğrusu</p>
            <p>{lesson.corrected}</p>
          </div>
          <span className="lp-phone-next">Devam et</span>
        </div>
        <figcaption className="lp-caption">Ders ekranı örneği · {lesson.level}</figcaption>
      </figure>

      <svg className="lp-beam lp-beam--right" viewBox="0 0 200 120" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="lp-beam-r" x1="0" x2="1">
            <stop offset="0" stopColor="#8e98ff" stopOpacity=".7" />
            <stop offset="1" stopColor="#8e98ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0 40 C 80 40, 110 80, 200 80" stroke="url(#lp-beam-r)" strokeWidth="1.5" fill="none" />
        <path d="M0 40 C 80 40, 110 80, 200 80" className="lp-beam-pulse lp-beam-pulse--late" fill="none" />
      </svg>

      <div className="lp-stage-path lp-float lp-float--slow" aria-hidden>
        <p className="lp-path-title">
          {path.title}
          <span>{path.subtitle}</span>
        </p>
        <ol>
          {path.nodes.map((node) => (
            <li key={node.label} className={cn("lp-path-node", `is-${node.state}`)}>
              <span className="lp-path-dot">{node.state === "done" ? <Check className="h-3 w-3" /> : null}</span>
              <span className="lp-path-label">{node.label}</span>
              {node.state === "next" ? <span className="lp-path-next">Sıradaki</span> : null}
              {node.plus ? (
                <span className="lp-path-plus">
                  <Lock className="h-3 w-3" />
                  Plus
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>

      <div className="lp-gain lp-float lp-float--late" aria-hidden>
        <span className="lp-gain-value">{gain.value}</span>
        <span className="lp-gain-detail">{gain.detail}</span>
      </div>
    </div>
  );
}
