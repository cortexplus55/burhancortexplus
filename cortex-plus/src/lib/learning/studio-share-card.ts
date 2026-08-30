const TOOL_LABEL: Record<string, string> = {
  quiz: "Quiz",
  tf: "Doğru / Yanlış",
  flash: "Flashcard",
  podcast: "Podcast",
  sozlu: "Sözlü deneme",
  yazili: "Yazılı deneme",
};

export function downloadStudioCard(input: {
  tool: string;
  topic: string;
  title: string;
  scoreLabel?: string;
}) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const gold = "#f4ae0b";
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, "#1a1408");
  bg.addColorStop(0.45, "#0a0a0c");
  bg.addColorStop(1, "#050505");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const glow = ctx.createRadialGradient(540, 180, 20, 540, 180, 420);
  glow.addColorStop(0, "rgba(244, 174, 11, 0.28)");
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(244, 174, 11, 0.35)";
  ctx.lineWidth = 4;
  ctx.strokeRect(48, 48, canvas.width - 96, canvas.height - 96);

  ctx.fillStyle = gold;
  ctx.font = "600 28px Figtree, system-ui, sans-serif";
  ctx.fillText("CORTEX PLUS", 88, 140);
  ctx.fillStyle = "#a3a3a3";
  ctx.font = "500 26px Figtree, system-ui, sans-serif";
  ctx.fillText((TOOL_LABEL[input.tool] ?? input.tool).toUpperCase(), 88, 186);

  ctx.fillStyle = "#fafafa";
  ctx.font = "400 72px 'DM Serif Display', Georgia, serif";
  wrapText(ctx, input.title, 88, 360, 900, 82);

  if (input.scoreLabel) {
    ctx.fillStyle = gold;
    ctx.font = "400 120px 'DM Serif Display', Georgia, serif";
    ctx.fillText(input.scoreLabel, 88, 780);
  }

  ctx.fillStyle = "#d4d4d4";
  ctx.font = "400 32px Figtree, system-ui, sans-serif";
  wrapText(ctx, input.topic || "Cortex Plus stüdyo", 88, 900, 900, 42);

  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = "500 24px Figtree, system-ui, sans-serif";
  ctx.fillText("cortexplus.app", 88, 1240);

  const link = document.createElement("a");
  link.download = `cortex-${input.tool}-kart.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(" ");
  let line = "";
  let cursor = y;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, cursor);
      line = word;
      cursor += lineHeight;
    } else {
      line = next;
    }
  }
  if (line) ctx.fillText(line, x, cursor);
}
