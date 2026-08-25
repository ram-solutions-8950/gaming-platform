import React from 'react';

export const GlitterRain: React.FC = () => {
  // Generate an array of random positions, durations, and delays for the glitter particles
  const particles = Array.from({ length: 50 }).map((_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    animationDuration: `${3 + Math.random() * 4}s`,
    animationDelay: `${Math.random() * 5}s`,
    width: `${2 + Math.random() * 4}px`,
    height: `${4 + Math.random() * 8}px`,
    opacity: 0.3 + Math.random() * 0.7,
  }));

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="pointer-events-none absolute -top-4 bg-gradient-to-b from-yellow-300 to-yellow-600 rounded-full animate-glitter-fall shadow-[0_0_8px_rgba(252,211,77,0.8)]"
          style={{
            left: p.left,
            width: p.width,
            height: p.height,
            opacity: p.opacity,
            animationDuration: p.animationDuration,
            animationDelay: p.animationDelay,
            animationTimingFunction: 'linear',
            animationIterationCount: 'infinite',
          }}
        />
      ))}
    </div>
  );
};
