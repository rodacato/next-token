// Procedural paper grain and ink texture, shared by every board.
const SVG_NS = "http://www.w3.org/2000/svg";

const defs = `
  <filter id="paper-grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="11" result="fine"/>
    <feColorMatrix in="fine" type="matrix" result="speck"
      values="0 0 0 0 0.10  0 0 0 0 0.10  0 0 0 0 0.10  0 0 0 0.55 -0.18"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="4" result="broad"/>
    <feColorMatrix in="broad" type="matrix" result="mottle"
      values="0 0 0 0 0.69  0 0 0 0 0.55  0 0 0 0 0.34  0 0 0 0.35 -0.12"/>
    <feMerge><feMergeNode in="mottle"/><feMergeNode in="speck"/></feMerge>
  </filter>

  <!-- Uneven inked impression: wobbly edges, patchy density, a few voids. -->
  <filter id="ink" x="-4%" y="-25%" width="108%" height="150%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="edge"/>
    <feDisplacementMap in="SourceGraphic" in2="edge" scale="1.1" xChannelSelector="R" yChannelSelector="G" result="wobbled"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3" result="blot"/>
    <feColorMatrix in="blot" type="matrix" result="density"
      values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.8 1.8"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed="19" result="pores"/>
    <feColorMatrix in="pores" type="matrix" result="voids"
      values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -5 3.6"/>
    <feComposite in="wobbled" in2="density" operator="in" result="patchy"/>
    <feComposite in="patchy" in2="voids" operator="in"/>
  </filter>

  <!-- Worn metal for the faces of sorts and the stick. -->
  <filter id="worn" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="2" seed="23" result="n"/>
    <feColorMatrix in="n" type="matrix" result="scuff"
      values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 -0.22"/>
    <feComposite in="scuff" in2="SourceGraphic" operator="in" result="marks"/>
    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="marks"/></feMerge>
  </filter>
`;

export function installTextures({ grain = true } = {}) {
  const holder = document.createElementNS(SVG_NS, "svg");
  holder.setAttribute("width", "0");
  holder.setAttribute("height", "0");
  holder.setAttribute("aria-hidden", "true");
  holder.style.position = "absolute";
  holder.innerHTML = `<defs>${defs}</defs>`;
  document.body.prepend(holder);

  if (grain) {
    const overlay = document.createElementNS(SVG_NS, "svg");
    overlay.setAttribute("class", "grain");
    overlay.setAttribute("width", "100%");
    overlay.setAttribute("height", "100%");
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `<rect width="100%" height="100%" filter="url(#paper-grain)"/>`;
    document.body.append(overlay);
  }
}
