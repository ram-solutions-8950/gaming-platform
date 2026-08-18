import React from 'react';

interface CardProps { children: React.ReactNode; className?: string; title?: string; }

export function Card({ children, className = '', title }: CardProps) {
  return (
    <div className={`bg-dark-900 border border-dark-700 rounded-xl p-6 ${className}`}>
      {title && <h3 className="text-lg font-semibold text-gray-100 mb-4">{title}</h3>}
      {children}
    </div>
  );
}
