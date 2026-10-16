export type ChunkStrategy = "fixed" | "sentence" | "section";
export const chunkStrategies: readonly ChunkStrategy[] = ["fixed", "sentence", "section"];

// Sections are separated by a blank line; the first line of a section is its heading.
export function chunk(handbook: string, strategy: ChunkStrategy, fixedSize: number): string[] {
  const sections = handbook
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  switch (strategy) {
    case "section":
      return sections;
    case "sentence":
      return sections.flatMap((s) => s.split(/(?<=[.!?])\s+|\n/).map((x) => x.trim()).filter(Boolean));
    case "fixed": {
      const flat = sections.join(" ");
      const pieces: string[] = [];
      for (let i = 0; i < flat.length; i += fixedSize) pieces.push(flat.slice(i, i + fixedSize).trim());
      return pieces.filter(Boolean);
    }
  }
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export type Ranked = { readonly index: number; readonly text: string; readonly score: number };

export function rank(query: Float32Array, chunks: readonly { text: string; vector: Float32Array }[]): Ranked[] {
  return chunks.map((c, index) => ({ index, text: c.text, score: cosine(query, c.vector) })).sort((a, b) => b.score - a.score || a.index - b.index);
}

// e5 models are trained with these prefixes; leaving them off lowers retrieval quality.
export const queryText = (q: string) => `query: ${q}`;
export const passageText = (p: string) => `passage: ${p}`;

export function encodeVector(v: Float32Array): string {
  const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function decodeVector(s: string): Float32Array {
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}
