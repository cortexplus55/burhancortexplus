import { boardCardAllowed, boardToolOutput, parseBoardToolArguments } from "@/lib/tutor/realtime/board-cards";
import {
  BOARD_CARD_MAX,
  BOARD_TOOL_NAME,
  emptyUsage,
  type BoardCard,
  type RealtimeTranscriptTurn,
  type RealtimeUsageSnapshot,
} from "@/lib/tutor/realtime/config";

/*
  Realtime olaylarının istemci tarafı makinesi (21 Kasım 2026). Veri kanalından ("oai-events") gelen her olay buraya
  verilir; makine konuşma durumunu (bağlanıyor / dinliyor / düşünüyor / konuşuyor), canlı dökümü, tahta kartlarını ve
  kullanımı tutar, yapılacak işleri (`EngineEffect`) döner. WebRTC'den bağımsız ve saf: birim testi sahte olay dizisiyle
  koşar. Olay adları OpenAI SDK tiplerinden (openai@7.5, resources/realtime/realtime.d.ts):

    conversation.item.added / .created              konuşma satırı açılır (sıra korunur)
    conversation.item.input_audio_transcription.*   öğrencinin sözü (delta, completed, failed)
    input_audio_buffer.speech_started / _stopped    öğrenci konuşmaya başladı / sustu
    response.created / response.done                öğretmen düşünüyor / cevap bitti (kullanım burada)
    response.output_audio_transcript.delta / .done  öğretmenin sözü, kelime kelime
    output_audio_buffer.started / stopped / cleared yalnız WebRTC: ses gerçekten çalıyor / bitti / kesildi
    response.function_call_arguments.done           tahtaya_yaz aracı
*/

export type EngineStatus = "connecting" | "listening" | "thinking" | "speaking";

export type EngineTurn = { id: string; role: "user" | "assistant"; text: string; final: boolean };

export type TranscriptUpdate = { role: "user" | "assistant"; text: string; final: boolean; id: string };

export type EngineEffect =
  | { type: "transcript"; turn: TranscriptUpdate }
  | { type: "card"; card: BoardCard }
  | { type: "send"; event: Record<string, unknown> }
  | { type: "status"; status: EngineStatus };

type RealtimeEvent = { type?: unknown; [key: string]: unknown };

/** Öğrencinin paylaştığı görselin satırdaki adı (sohbete de böyle yazılır). */
export const IMAGE_TURN_TEXT = "📷 Fotoğraf";

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

export class RealtimeEngine {
  status: EngineStatus = "connecting";
  readonly turns: EngineTurn[] = [];
  readonly cards: (BoardCard & { afterTurnId: string | null })[] = [];
  usage: RealtimeUsageSnapshot = emptyUsage();
  private userSpeaking = false;
  private outputPlaying = false;
  private responseActive = false;
  private readonly continueAfter = new Set<string>();
  private readonly boardCardMax: number;
  private cardSeq = 0;
  private imageSeq = 0;

  constructor(options: { boardCardMax?: number } = {}) {
    this.boardCardMax = Math.min(options.boardCardMax ?? BOARD_CARD_MAX, BOARD_CARD_MAX);
  }

  private setStatus(next: EngineStatus, effects: EngineEffect[]) {
    if (this.status === next) return;
    this.status = next;
    effects.push({ type: "status", status: next });
  }

  private turn(id: string, role: "user" | "assistant"): EngineTurn {
    let found = this.turns.find((entry) => entry.id === id);
    if (!found) {
      found = { id, role, text: "", final: false };
      this.turns.push(found);
    }
    return found;
  }

  private emit(turn: EngineTurn, effects: EngineEffect[]) {
    effects.push({ type: "transcript", turn: { id: turn.id, role: turn.role, text: turn.text, final: turn.final } });
  }

  /** Veri kanalı açıldı: öğretmen ilk sözü söylesin (adıyla selam, talimattaki açılış kuralı). */
  opened(): EngineEffect[] {
    const effects: EngineEffect[] = [];
    this.setStatus("thinking", effects);
    effects.push({ type: "send", event: { type: "response.create" } });
    return effects;
  }

  /** Öğrencinin görseli (veri URI'si) konuşmaya eklenir; öğretmen ona bakarak sürdürür. */
  image(dataUrl: string): EngineEffect[] {
    this.imageSeq += 1;
    const id = `img_${Date.now().toString(36)}${this.imageSeq}`.slice(0, 32);
    const turn = this.turn(id, "user");
    turn.text = IMAGE_TURN_TEXT;
    turn.final = true;
    const effects: EngineEffect[] = [];
    this.emit(turn, effects);
    effects.push({
      type: "send",
      event: {
        type: "conversation.item.create",
        item: { id, type: "message", role: "user", content: [{ type: "input_image", image_url: dataUrl }] },
      },
    });
    if (!this.userSpeaking) effects.push({ type: "send", event: { type: "response.create" } });
    return effects;
  }

  handle(raw: RealtimeEvent): EngineEffect[] {
    const effects: EngineEffect[] = [];
    const type = typeof raw.type === "string" ? raw.type : "";
    switch (type) {
      case "conversation.item.added":
      case "conversation.item.created": {
        const item = raw.item as { id?: unknown; type?: unknown; role?: unknown } | undefined;
        if (item?.type === "message" && typeof item.id === "string" && (item.role === "user" || item.role === "assistant")) {
          this.turn(item.id, item.role);
        }
        break;
      }
      case "conversation.item.input_audio_transcription.delta": {
        const id = String(raw.item_id ?? "");
        if (!id) break;
        const turn = this.turn(id, "user");
        turn.text += String(raw.delta ?? "");
        this.emit(turn, effects);
        break;
      }
      case "conversation.item.input_audio_transcription.completed": {
        const id = String(raw.item_id ?? "");
        if (!id) break;
        const turn = this.turn(id, "user");
        const text = String(raw.transcript ?? "").trim();
        turn.text = text || turn.text.trim();
        turn.final = true;
        this.emit(turn, effects);
        this.addTranscriptionUsage(raw.usage);
        break;
      }
      case "conversation.item.input_audio_transcription.failed": {
        const id = String(raw.item_id ?? "");
        const turn = id ? this.turns.find((entry) => entry.id === id) : undefined;
        if (turn) {
          turn.final = true;
          turn.text = turn.text.trim();
          this.emit(turn, effects);
        }
        break;
      }
      case "input_audio_buffer.speech_started":
        this.userSpeaking = true;
        this.setStatus("listening", effects);
        break;
      case "input_audio_buffer.speech_stopped":
        this.userSpeaking = false;
        this.setStatus("thinking", effects);
        break;
      case "response.created":
        this.responseActive = true;
        if (!this.outputPlaying && !this.userSpeaking) this.setStatus("thinking", effects);
        break;
      case "response.output_audio_transcript.delta": {
        const id = String(raw.item_id ?? "");
        if (!id) break;
        const turn = this.turn(id, "assistant");
        turn.text += String(raw.delta ?? "");
        this.emit(turn, effects);
        if (!this.userSpeaking) this.setStatus("speaking", effects);
        break;
      }
      case "response.output_audio_transcript.done": {
        const id = String(raw.item_id ?? "");
        if (!id) break;
        const turn = this.turn(id, "assistant");
        const text = String(raw.transcript ?? "").trim();
        if (text) turn.text = text;
        turn.final = true;
        this.emit(turn, effects);
        break;
      }
      case "output_audio_buffer.started":
        this.outputPlaying = true;
        if (!this.userSpeaking) this.setStatus("speaking", effects);
        break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        this.outputPlaying = false;
        this.setStatus(this.userSpeaking ? "listening" : this.responseActive ? "thinking" : "listening", effects);
        break;
      case "response.function_call_arguments.done": {
        if (raw.name !== BOARD_TOOL_NAME) break;
        const callId = String(raw.call_id ?? "");
        const card = parseBoardToolArguments(String(raw.arguments ?? ""));
        const accepted = Boolean(card) && boardCardAllowed(this.cards.length) && this.cards.length < this.boardCardMax;
        if (card && accepted) {
          this.cardSeq += 1;
          const full: BoardCard = { id: `card_${this.cardSeq}`, ...card };
          const anchor = [...this.turns].reverse().find((entry) => entry.role === "assistant" && entry.text.trim())
            ?? [...this.turns].reverse().find((entry) => entry.text.trim());
          this.cards.push({ ...full, afterTurnId: anchor?.id ?? null });
          effects.push({ type: "card", card: full });
        }
        if (callId) {
          effects.push({
            type: "send",
            event: {
              type: "conversation.item.create",
              item: { type: "function_call_output", call_id: callId, output: boardToolOutput(Boolean(card && accepted)) },
            },
          });
        }
        if (typeof raw.response_id === "string") this.continueAfter.add(raw.response_id);
        break;
      }
      case "response.done": {
        this.responseActive = false;
        const response = raw.response as { id?: unknown; usage?: unknown } | undefined;
        this.addResponseUsage(response?.usage);
        const id = typeof response?.id === "string" ? response.id : "";
        // Araçtan sonra konuşma sürsün (öğrenci bu arada konuşmaya başlamadıysa).
        if (id && this.continueAfter.delete(id) && !this.userSpeaking) {
          effects.push({ type: "send", event: { type: "response.create" } });
          this.responseActive = true;
        } else if (!this.outputPlaying && !this.userSpeaking) {
          this.setStatus("listening", effects);
        }
        break;
      }
      default:
        break;
    }
    return effects;
  }

  private addResponseUsage(raw: unknown) {
    if (!raw || typeof raw !== "object") return;
    const usage = raw as {
      input_token_details?: {
        text_tokens?: unknown;
        audio_tokens?: unknown;
        image_tokens?: unknown;
        cached_tokens?: unknown;
        cached_tokens_details?: { text_tokens?: unknown; audio_tokens?: unknown; image_tokens?: unknown };
      };
      output_token_details?: { text_tokens?: unknown; audio_tokens?: unknown };
      input_tokens?: unknown;
      output_tokens?: unknown;
    };
    const input = usage.input_token_details ?? {};
    const cached = input.cached_tokens_details;
    const cachedText = cached ? num(cached.text_tokens) : num(input.cached_tokens);
    const cachedAudio = cached ? num(cached.audio_tokens) : 0;
    const cachedImage = cached ? num(cached.image_tokens) : 0;
    const textIn = usage.input_token_details ? num(input.text_tokens) : num(usage.input_tokens);
    this.usage.textIn += Math.max(0, textIn - cachedText);
    this.usage.audioIn += Math.max(0, num(input.audio_tokens) - cachedAudio);
    this.usage.imageIn += Math.max(0, num(input.image_tokens) - cachedImage);
    this.usage.cachedText += cachedText;
    this.usage.cachedAudio += cachedAudio;
    this.usage.cachedImage += cachedImage;
    const output = usage.output_token_details;
    this.usage.textOut += output ? num(output.text_tokens) : num(usage.output_tokens);
    this.usage.audioOut += output ? num(output.audio_tokens) : 0;
    this.usage.responses += 1;
  }

  private addTranscriptionUsage(raw: unknown) {
    if (!raw || typeof raw !== "object") return;
    const usage = raw as { type?: unknown; seconds?: unknown; input_tokens?: unknown; input_token_details?: { audio_tokens?: unknown } };
    if (usage.type === "duration") {
      this.usage.transcribeAudio += Math.round(Number(usage.seconds ?? 0) * 10) || 0;
      return;
    }
    this.usage.transcribeAudio += num(usage.input_token_details?.audio_tokens) || num(usage.input_tokens);
  }

  /** /end gövdesi: boş satırlar düşer, kartın bağlandığı satırın dizini yeni listeye göre. */
  transcriptForEnd(): {
    turns: RealtimeTranscriptTurn[];
    cards: { kind: BoardCard["kind"]; title: string; body: string; afterTurn?: number }[];
  } {
    const kept = this.turns.filter((turn) => turn.text.trim());
    const indexOf = new Map(kept.map((turn, index) => [turn.id, index] as const));
    return {
      turns: kept.map((turn) => ({ role: turn.role, text: turn.text.trim() })),
      cards: this.cards.map((card) => {
        const index = card.afterTurnId != null ? indexOf.get(card.afterTurnId) : undefined;
        return { kind: card.kind, title: card.title, body: card.body, ...(index != null ? { afterTurn: index } : {}) };
      }),
    };
  }

  /** En az bir söz duyuldu ya da ses çaldı (bağlantı gerçekten kuruldu). */
  get heard(): boolean {
    return this.usage.responses > 0 || this.turns.some((turn) => turn.text.trim());
  }
}
