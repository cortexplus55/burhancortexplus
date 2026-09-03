import { renderMath, splitMath } from "@/lib/learning/math-text";

/**
 * Kalın metin ve LaTeX'i birlikte işler. Formüller KaTeX'e verilir
 * (`trust: false` — HTML enjekte eden komutlar kapalı); geri kalan her şey
 * React metin düğümü olarak kalır, yani escape'i React yapar.
 */
function renderInline(text: string) {
  return splitMath(text).flatMap((segment, segIndex) => {
    if (segment.type === "math") {
      const Tag = segment.display ? "div" : "span";
      return (
        <Tag
          key={`m-${segIndex}`}
          className={segment.display ? "ap-lesson-math" : undefined}
          dangerouslySetInnerHTML={{
            __html: renderMath(segment.value, segment.display),
          }}
        />
      );
    }
    return segment.value.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={`${segIndex}-${index}`}>{part.slice(2, -2)}</strong>;
      }
      return <span key={`${segIndex}-${index}`}>{part}</span>;
    });
  });
}

export function ExamLessonBody({ content }: { content: string }) {
  const blocks = content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (!blocks.length) {
    return (
      <p className="text-sm text-[var(--ap-muted)]">
        Bu dersin içeriği henüz oluşmadı. Çalışma oturumuna dönüp birkaç soru sor, sonra tekrar aç.
      </p>
    );
  }

  return (
    <div className="ap-lesson-prose">
      {blocks.map((block, index) => {
        const heading = /^##\s+(.+)$/.exec(block);
        if (heading) {
          return <h2 key={index}>{heading[1]}</h2>;
        }

        const lines = block.split("\n");
        if (lines.every((line) => /^\s*-\s+/.test(line))) {
          return (
            <ul key={index}>
              {lines.map((line) => (
                <li key={line}>{renderInline(line.replace(/^\s*-\s+/, ""))}</li>
              ))}
            </ul>
          );
        }

        const speaker = /^(?:\*\*)?(Sen|Cortex)(?:\*\*)?:\s*/.exec(block);
        if (speaker) {
          const who = speaker[1];
          const body = block.slice(speaker[0].length);
          return (
            <article
              key={index}
              className={
                who === "Cortex" ? "ap-lesson-turn ap-lesson-turn--ai" : "ap-lesson-turn"
              }
            >
              <p className="ap-lesson-turn-who">{who === "Cortex" ? "Cortex" : "Sen"}</p>
              <p>{renderInline(body)}</p>
            </article>
          );
        }

        return <p key={index}>{renderInline(block)}</p>;
      })}
    </div>
  );
}
