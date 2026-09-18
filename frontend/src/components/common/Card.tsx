import React from 'react';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
}

export function Card({ children, className = '', title }: CardProps) {
  return (
    <div className={`bg-dark-900 border border-dark-700 rounded-xl p-6 ${className}`}>
      {title && <div className="text-lg font-semibold text-gray-100 mb-4">{title}</div>}
      {children}
    </div>
  );
}
