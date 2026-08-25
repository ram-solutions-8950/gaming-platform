import { useMemo } from "react";

interface ParticleBurstProps {
  keyToken?: number;
  count?: number;
}

export function ParticleBurst({ count = 20 }: ParticleBurstProps) {
  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const distance = 60 + Math.random() * 80;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      return {
        id: i,
        style: {
          "--particle-end": `translate(${x}px, ${y}px)`,
          animationDelay: `${Math.random() * 0.15}s`,
        } as React.CSSProperties,
      };
    });
  }, [count]);

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible">
      {particles.map((p) => (
        <span key={p.id} className="t777-particle" style={p.style} />
      ))}
    </div>
  );
}
