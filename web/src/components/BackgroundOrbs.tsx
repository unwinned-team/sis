interface SmokePlumeProps {
  id: string;
  seed: number;
  color: string;
  className?: string;
}

function SmokePlume({ id, seed, color, className }: SmokePlumeProps) {
  return (
    <svg viewBox="0 0 400 640" className={className}>
      <filter id={id} x="-60%" y="-40%" width="220%" height="180%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.011 0.019"
          numOctaves="4"
          seed={seed}
        />
        <feDisplacementMap in="SourceGraphic" scale="150" />
        <feGaussianBlur stdDeviation="7" />
      </filter>
      <g filter={`url(#${id})`} fill={color}>
        <ellipse cx="200" cy="330" rx="62" ry="240" opacity="0.55" />
        <ellipse cx="148" cy="420" rx="42" ry="160" opacity="0.38" />
        <ellipse cx="256" cy="230" rx="38" ry="170" opacity="0.45" />
        <ellipse cx="210" cy="120" rx="52" ry="90" opacity="0.3" />
      </g>
    </svg>
  );
}

export function BackgroundOrbs() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <span className="orb orb-drift-1 left-[-10%] top-[-15%] h-[45vmax] w-[45vmax] bg-teal-300/30" />
      <span className="orb orb-drift-2 right-[-12%] top-[10%] h-[40vmax] w-[40vmax] bg-cyan-300/30" />
      <span className="orb orb-drift-3 bottom-[-20%] left-[15%] h-[42vmax] w-[42vmax] bg-teal-200/35" />
      <span className="orb orb-drift-4 bottom-[5%] right-[20%] h-[30vmax] w-[30vmax] bg-sky-300/25" />
      <SmokePlume
        id="smoke-plume-right"
        seed={7}
        color="#64748b"
        className="smoke smoke-drift-1 right-[-8%] top-[-12%] h-[85vh] w-[34vw] min-w-[300px]"
      />
      <SmokePlume
        id="smoke-plume-left"
        seed={13}
        color="#0f172a"
        className="smoke smoke-drift-2 bottom-[-18%] left-[-10%] h-[80vh] w-[32vw] min-w-[280px]"
      />
      <SmokePlume
        id="smoke-plume-mid"
        seed={29}
        color="#94a3b8"
        className="smoke smoke-drift-3 left-[16%] top-[24%] h-[65vh] w-[24vw] min-w-[220px]"
      />
    </div>
  );
}
