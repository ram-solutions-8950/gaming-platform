import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useRewardStore } from '../../store/rewardStore';

interface NavItem {
  to?: string;
  label: string;
  emoji: string;
  className?: string;
  action?: boolean;
}

const navItems: NavItem[] = [
  {
    label: 'REFER & EARN',
    emoji: '🎁',
    className: 'nav-refer',
  },
  {
    label: 'VIP BONUS',
    emoji: '👑',
    className: 'nav-vip',
  },

  // HOME
  {
    to: '/dashboard',
    label: 'Home',
    emoji: '🏠',
    className: 'nav-home',
  },

  // ACTIVITY
  {
    to: '/transactions',
    label: 'Activity',
    emoji: '🎯',
    className: 'nav-activity',
  },

  // WALLET
  {
    to: '/wallet',
    label: 'Wallet',
    emoji: '💳',
    className: 'nav-wallet',
  },

  // SERVICES
  {
    label: 'Services',
    emoji: '🎧',
    className: 'nav-service',
  },

  // PROFILE
  {
    to: '/profile',
    label: 'Profile',
    emoji: '👤',
    className: 'nav-profile',
  },

  // JACKPOT
  {
    label: 'Jackpot',
    emoji: '🎟️',
    className: 'nav-jackpot',
  },
];

export const LobbyBottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const activeModal = useRewardStore((s) => s.activeModal);

  const isItemActive = (item: NavItem) => {
    if (item.to) {
      if (item.to === '/dashboard') {
        return location.pathname === '/dashboard' || location.pathname === '/';
      }
      return location.pathname.startsWith(item.to);
    }
    if (item.label === 'VIP BONUS') return activeModal === 'vip';
    if (item.label === 'Services' || item.label === 'Service') return activeModal === 'service';
    if (item.label === 'Jackpot') return activeModal === 'jackpot';
    return false;
  };

  const handleAction = (item: NavItem) => {
    if (item.to) {
      navigate(item.to);
      return;
    }

    switch (item.label) {
      case 'REFER & EARN':
        if (window.location.pathname !== '/dashboard') {
          navigate('/dashboard');
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('open-refer-popup'));
          }, 100);
        } else {
          window.dispatchEvent(new CustomEvent('open-refer-popup'));
        }
        break;

      case 'VIP BONUS':
        useRewardStore.getState().openModal('vip');
        break;

      case 'Services':
      case 'Service':
        useRewardStore.getState().openModal('service');
        break;

      case 'Jackpot':
        useRewardStore.getState().openModal('jackpot');
        break;

      default:
        break;
    }
  };

  return (
    <nav className="lobby-bottom-nav client-style-nav">
      <div className="client-nav-inner">

        {navItems.map((item) => {
          const active = isItemActive(item);

          if (item.to) {
            return (
              <NavLink
                key={item.label}
                to={item.to}
                className={({ isActive }) =>
                  [
                    'client-nav-item',
                    item.className || '',
                    (isActive || active)
                      ? 'client-nav-item--active'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')
                }
                aria-label={item.label}
              >
                <span className="client-nav-icon">
                  {item.emoji}
                </span>

                <span className="client-nav-label">
                  {item.label}
                </span>

                {(active) && <span className="client-nav-indicator" />}
              </NavLink>
            );
          }

          /*
           * NON-ROUTED BUTTONS
           */

          return (
            <button
              key={item.label}
              type="button"
              className={[
                'client-nav-item',
                item.className || '',
                active ? 'client-nav-item--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => handleAction(item)}
              aria-label={item.label}
            >
              <span className="client-nav-icon">
                {item.emoji}
              </span>

              <span className="client-nav-label">
                {item.label}
              </span>

              {active && <span className="client-nav-indicator" />}
            </button>
          );
        })}

      </div>
    </nav>
  );
};

export default LobbyBottomNav;