import React from 'react';
import casinoCardsEmblem from '../../assets/casino-cards-3d-emblem.webp';
import pokerHero from '../../assets/poker-hero.webp';
import teenPattiHero from '../../assets/teen-patti-hero.webp';
import '../../styles/animated-casino-logo.css';

export interface AnimatedCasinoGameLogoProps {
  game?: string;
  className?: string;
}

export const AnimatedCasinoGameLogo: React.FC<AnimatedCasinoGameLogoProps> = ({
  game = 'cards',
  className = '',
}) => {
  const g = game.toLowerCase();
  const isPoker = g.includes('poker');
  const isTeenPatti = g.includes('teen') || g.includes('patti');

  const imgSrc = isPoker
    ? pokerHero
    : isTeenPatti
    ? teenPattiHero
    : casinoCardsEmblem;

  return (
    <div
      className={`casino-card-art-container ${className} ${isPoker ? 'casino-card-art--poker' : ''} ${isTeenPatti ? 'casino-card-art--teen-patti' : ''}`}
      data-game={game}
      aria-hidden="true"
    >
      {/* 1. Purple + Gold Ambient Aura */}
      <div className="casino-card-art-aura" />

      {/* 2. 3D Floating Artwork with Specular Lighting */}
      <div className="casino-card-art-img-wrap">
        <img
          src={imgSrc}
          alt=""
          className="casino-card-art-img"
          loading="lazy"
          decoding="async"
        />
      </div>

      {/* 3. Text Protection Gradient Overlay */}
      <div className="casino-card-art-overlay" />

      {/* 4. Diagonal Gold Light Sweep Reflection */}
      <div className="casino-card-art-sweep" />
    </div>
  );
};
