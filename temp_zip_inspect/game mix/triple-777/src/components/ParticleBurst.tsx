import { useMemo, type CSSProperties } from "react";

type ParticleStyle = CSSProperties & { "--particle-end": string };

/** A handful of small gold dots bursting outward from center — plain CSS
 * animation (`.particle` in index.css), no canvas/animation library. Cheap
 * enough for low-end devices: a dozen divs, one keyframe each, GPU-composited
 * transform/opacity only. */
export function ParticleBurst({ count = 14, keyToken }: { count?: number; keyToken: number }) {
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 50 + Math.random() * 60;
        const x = Math.cos(angle) * dist;
        const y = Math.sin(angle) * dist;
        return { id: i, x, y, delay: Math.random() * 0.15 };
      }),
    [keyToken, count],
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      {particles.map((p) => (
        <div
          key={p.id}
          className="particle left-1/2 top-1/2"
          style={{
            "--particle-end": `translate(${p.x}px, ${p.y}px)`,
            animationDelay: `${p.delay}s`,
          } as ParticleStyle}
        />
      ))}
    </div>
  );
}
