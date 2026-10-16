// Procedural paper grain and inked-impression filters, referenced by id across the bench.
export function Textures() {
  return (
    <>
      <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
        <defs>
          <filter id="paper-grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="11" result="fine" />
            <feColorMatrix in="fine" type="matrix" result="speck" values="0 0 0 0 0.10  0 0 0 0 0.10  0 0 0 0 0.10  0 0 0 0.55 -0.18" />
            <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="4" result="broad" />
            <feColorMatrix in="broad" type="matrix" result="mottle" values="0 0 0 0 0.69  0 0 0 0 0.55  0 0 0 0 0.34  0 0 0 0.35 -0.12" />
            <feMerge>
              <feMergeNode in="mottle" />
              <feMergeNode in="speck" />
            </feMerge>
          </filter>
          <filter id="ink" x="-4%" y="-25%" width="108%" height="150%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="edge" />
            <feDisplacementMap in="SourceGraphic" in2="edge" scale="1.1" xChannelSelector="R" yChannelSelector="G" result="wobbled" />
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3" result="blot" />
            <feColorMatrix in="blot" type="matrix" result="density" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.8 1.8" />
            <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed="19" result="pores" />
            <feColorMatrix in="pores" type="matrix" result="voids" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -4 3.2" />
            <feComposite in="wobbled" in2="density" operator="in" result="patchy" />
            <feComposite in="patchy" in2="voids" operator="in" />
          </filter>
          <filter id="ink-display" x="-4%" y="-25%" width="108%" height="150%">
            <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" seed="7" result="edge" />
            <feDisplacementMap in="SourceGraphic" in2="edge" scale="1.6" xChannelSelector="R" yChannelSelector="G" result="wobbled" />
            <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="5" result="blot" />
            <feColorMatrix in="blot" type="matrix" result="density" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 1.6" />
            <feComposite in="wobbled" in2="density" operator="in" />
          </filter>
        </defs>
      </svg>
      <svg className="grain" aria-hidden="true">
        <rect width="100%" height="100%" filter="url(#paper-grain)" />
      </svg>
    </>
  );
}
