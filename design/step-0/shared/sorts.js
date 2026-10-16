// A metal sort seen from above: body, shoulder, and the raised face.
// Mono advance is ~0.6em, so width follows the token's length.
export const MONO_ADVANCE = 0.6;

export function sortSize(face, height) {
  const fontSize = height * 0.4;
  const width = Math.max(height * 0.82, face.length * fontSize * MONO_ADVANCE + height * 0.42);
  return { width, height, fontSize };
}

export function sortMarkup({ face, height, variant = "metal", x = 0, y = 0, anchor = "center" }) {
  const { width, fontSize } = sortSize(face, height);
  const left = anchor === "center" ? x - width / 2 : x;
  const top = anchor === "center" ? y - height / 2 : y;
  const palette = {
    metal: { body: "var(--metal)", shoulder: "var(--ink)", text: "var(--paper)", stroke: "var(--ink)" },
    chosen: { body: "var(--vermilion)", shoulder: "color-mix(in oklab, var(--vermilion) 78%, var(--ink))", text: "var(--paper)", stroke: "color-mix(in oklab, var(--vermilion) 60%, var(--ink))" },
    pulled: { body: "transparent", shoulder: "transparent", text: "var(--slate)", stroke: "var(--slate-light)" },
  }[variant];
  const inset = Math.max(2, height * 0.08);
  const dash = variant === "pulled" ? `stroke-dasharray="3 3"` : "";
  return `
    <g class="sort sort--${variant}" data-face="${face}">
      <rect x="${left}" y="${top}" width="${width}" height="${height}" rx="1.5"
        fill="${palette.body}" stroke="${palette.stroke}" stroke-width="1" ${dash}
        ${variant === "pulled" ? "" : `filter="url(#worn)"`}/>
      <rect x="${left + inset}" y="${top + inset}" width="${width - inset * 2}" height="${height - inset * 2}" rx="1"
        fill="none" stroke="${palette.shoulder}" stroke-width="0.8" opacity="0.7"/>
      <text x="${left + width / 2}" y="${top + height / 2}" fill="${palette.text}"
        font-family="IBM Plex Mono, monospace" font-weight="500" font-size="${fontSize}"
        text-anchor="middle" dominant-baseline="central">${escapeXml(face)}</text>
    </g>`;
}

export function escapeXml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
