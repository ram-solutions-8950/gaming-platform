import React from 'react';
import corona888Logo from '../../assets/corona888-logo.jpg';
import '../../styles/casino-logo.css';

interface CasinoLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
  subtitleText?: string;
  titleText?: string;
  className?: string;
}

export const CasinoLogo: React.FC<CasinoLogoProps> = ({
  size = 'md',
  showSubtitle = false,
  subtitleText = 'TACTICAL GAMING APP',
  titleText = 'CORONA 888',
  className = '',
}) => {
  return (
    <div className={`casino-logo-root ${size} ${className}`} aria-label={titleText}>
      {/* Corona 888 Brand Logo */}
      <div className="casino-logo-emblem">
        <img
          src={corona888Logo}
          alt="Corona 888"
          className="casino-logo-svg"
          style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '12%' }}
        />
      </div>

      {/* Brand Text */}
      <div className="casino-logo-text-wrap">
        <h1 className="casino-logo-primary">{titleText}</h1>
        {showSubtitle && <span className="casino-logo-sub">{subtitleText}</span>}
      </div>
    </div>
  );
};
