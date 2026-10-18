/**
 * Akışla gelen ders JSON'undan biten parçaları çıkarır (18 Ekim 2026).
 *
 * Yazar dersi tek seferde yazıyor ama ekranlar sırayla bitiyor; her biten ekran
 * hemen denetime gider. Bu okuyucu yalnız JSON'u izler: dizgi içindeki parantezi
 * saymaz, kaçış karakterini bilir. Metne dokunmaz, şemayı denetlemez.
 *
 * Başlık alanları (title, overview, objective) şema sırasıyla "screens"ten önce
 * gelir; "screens" anahtarı görülünce önceki kısım kapatılıp okunur.
 */

export type LessonStreamHeader = { title?: unknown; overview?: unknown; objective?: unknown };

export class LessonStreamReader {
  private text = "";
  private pos = 0;
  private depth = 0;
  private inString = false;
  private escaped = false;
  private stringStart = -1;
  /** Üst nesnede son okunan dizgi ve ardından ':' geldi mi (anahtar). */
  private lastTopString: string | null = null;
  private currentKey: string | null = null;
  private screensDepth = -1;
  private elementStart = -1;
  private screensKeyAt = -1;
  header: LessonStreamHeader | null = null;
  readonly screens: unknown[] = [];
  /** Ayrıştırılamayan ekran sayısı (teşhis). */
  broken = 0;

  /** Yeni gelen parçayı ekler; bu parçayla biten ekranları döndürür. */
  feed(delta: string): unknown[] {
    if (!delta) return [];
    this.text += delta;
    const found: unknown[] = [];
    for (; this.pos < this.text.length; this.pos += 1) {
      const ch = this.text[this.pos]!;
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (ch === "\\") this.escaped = true;
        else if (ch === '"') {
          this.inString = false;
          if (this.depth === 1) {
            try {
              this.lastTopString = JSON.parse(this.text.slice(this.stringStart, this.pos + 1)) as string;
            } catch {
              this.lastTopString = null;
            }
          }
        }
        continue;
      }
      if (ch === '"') {
        this.inString = true;
        this.stringStart = this.pos;
        continue;
      }
      if (ch === ":" && this.depth === 1) {
        this.currentKey = this.lastTopString;
        if (this.currentKey === "screens") this.screensKeyAt = this.text.lastIndexOf('"screens"', this.pos);
        continue;
      }
      if (ch === "," && this.depth === 1) {
        this.currentKey = null;
        continue;
      }
      if (ch === "{" || ch === "[") {
        this.depth += 1;
        if (ch === "[" && this.depth === 2 && this.currentKey === "screens" && this.screensDepth < 0) {
          this.screensDepth = 2;
          this.readHeader();
        } else if (ch === "{" && this.screensDepth > 0 && this.depth === this.screensDepth + 1) {
          this.elementStart = this.pos;
        }
        continue;
      }
      if (ch === "}" || ch === "]") {
        if (ch === "}" && this.screensDepth > 0 && this.depth === this.screensDepth + 1 && this.elementStart >= 0) {
          const raw = this.text.slice(this.elementStart, this.pos + 1);
          this.elementStart = -1;
          try {
            const screen = JSON.parse(raw) as unknown;
            this.screens.push(screen);
            found.push(screen);
          } catch {
            this.broken += 1;
          }
        }
        if (ch === "]" && this.depth === this.screensDepth) this.screensDepth = -1;
        this.depth -= 1;
      }
    }
    return found;
  }

  /** Şimdiye kadar gelen metnin tamamı (akış bitince bütün ders bunun ayrıştırılmasıdır). */
  get fullText(): string {
    return this.text;
  }

  private readHeader() {
    if (this.screensKeyAt < 0) return;
    const head = this.text.slice(this.text.indexOf("{"), this.screensKeyAt).trimEnd().replace(/,$/, "");
    try {
      const parsed = JSON.parse(`${head}}`) as LessonStreamHeader;
      if (parsed && typeof parsed === "object") this.header = parsed;
    } catch {
      this.header = null;
    }
  }
}
