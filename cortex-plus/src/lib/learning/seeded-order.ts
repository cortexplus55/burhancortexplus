/** Kararlı karıştırma (xorshift, tohum = FNV-1a(tuz)). Aynı tuz aynı sırayı verir; saf (istemci de okur). */
export function seededOrder<T>(list: readonly T[], salt: string): T[] {
  if (list.length < 2) return [...list];
  let hash = 2166136261;
  for (let index = 0; index < salt.length; index += 1) {
    hash ^= salt.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0 || 1;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const out = [...list];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(random() * (index + 1));
    [out[index], out[pick]] = [out[pick], out[index]];
  }
  return out;
}
