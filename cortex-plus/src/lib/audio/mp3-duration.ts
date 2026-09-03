/**
 * MP3 süre ölçümü.
 *
 * Cümle senkronu ancak süreler gerçekse doğru; "dosya boyutu / bit hızı"
 * kestirimi VBR'de kayar ve podcast ilerledikçe vurgu sesin gerisinde kalır.
 * Bu yüzden çerçeveler tek tek yürünüyor: her MPEG Layer III çerçevesi sabit
 * sayıda örnek taşır, toplam süre çerçeve sayısından çıkar.
 */

// [MPEG sürümü][bit hızı indeksi] → kbps. 0 ve 15 geçersiz.
const BITRATES_V1_L3 = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
];
const BITRATES_V2_L3 = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0,
];

const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG 1
  2: [22050, 24000, 16000], // MPEG 2
  0: [11025, 12000, 8000], // MPEG 2.5
};

// Layer III örnek sayısı: MPEG1 1152, MPEG2/2.5 576.
function samplesPerFrame(versionBits: number): number {
  return versionBits === 3 ? 1152 : 576;
}

function id3Size(buf: Uint8Array): number {
  if (buf.length < 10) return 0;
  if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return 0; // "ID3"
  // Senkron güvenli tamsayı: her baytın alt 7 biti.
  const size =
    (buf[6] & 0x7f) * 0x200000 +
    (buf[7] & 0x7f) * 0x4000 +
    (buf[8] & 0x7f) * 0x80 +
    (buf[9] & 0x7f);
  return 10 + size;
}

/**
 * Süreyi milisaniye olarak döndürür. Çerçeve bulunamazsa 0 —
 * çağıran taraf bunu "ölçemedim" diye ele almalı, uydurulmuş bir
 * süre senkronu sessizce bozardı.
 */
export function mp3DurationMs(input: ArrayBuffer | Uint8Array): number {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  let offset = id3Size(buf);
  let samples = 0;
  let sampleRate = 0;

  while (offset + 4 <= buf.length) {
    // Çerçeve senkron sözcüğü: 11 bit 1.
    if (buf[offset] !== 0xff || (buf[offset + 1] & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }

    const versionBits = (buf[offset + 1] >> 3) & 0x03;
    const layerBits = (buf[offset + 1] >> 1) & 0x03;
    if (versionBits === 1 || layerBits !== 0x01) {
      // Ayrılmış sürüm ya da Layer III değil.
      offset += 1;
      continue;
    }

    const bitrateIndex = (buf[offset + 2] >> 4) & 0x0f;
    const rateIndex = (buf[offset + 2] >> 2) & 0x03;
    if (bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) {
      offset += 1;
      continue;
    }

    const table = versionBits === 3 ? BITRATES_V1_L3 : BITRATES_V2_L3;
    const bitrate = table[bitrateIndex] * 1000;
    const rate = SAMPLE_RATES[versionBits]?.[rateIndex] ?? 0;
    if (!bitrate || !rate) {
      offset += 1;
      continue;
    }

    const padding = (buf[offset + 2] >> 1) & 0x01;
    const perFrame = samplesPerFrame(versionBits);
    const frameLength =
      Math.floor((perFrame / 8) * (bitrate / rate)) + padding;
    if (frameLength <= 0) {
      offset += 1;
      continue;
    }

    samples += perFrame;
    sampleRate = rate;
    offset += frameLength;
  }

  if (!samples || !sampleRate) return 0;
  return Math.round((samples / sampleRate) * 1000);
}
