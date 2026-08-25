import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

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

  // SERVICE
  {
    label: 'Service',
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

  // ADD CASH
  {
    to: '/deposit',
    label: 'ADD CASH',
    emoji: '💰',
    className: 'nav-add-cash',
    action: true,
  },
];

export const LobbyBottomNav: React.FC = () => {
  const navigate = useNavigate();

  const handleAction = (item: NavItem) => {
    if (item.to) {
      navigate(item.to);
      return;
    }

    switch (item.label) {
      case 'REFER & EARN':
        console.log('Refer & Earn clicked');
        break;

      case 'VIP BONUS':
        console.log('VIP Bonus clicked');
        break;

      case 'Service':
        console.log('Service clicked');
        break;

      case 'Jackpot':
        console.log('Jackpot clicked');
        break;

      default:
        break;
    }
  };

  return (
    <nav className="lobby-bottom-nav client-style-nav">
      <div className="client-nav-inner">

        {navItems.map((item) => {
          /*
           * WORKING ROUTES:
           *
           * Home       → /dashboard
           * Activity   → /transactions
           * Wallet     → /wallet
           * Profile    → /profile
           * Add Cash   → /deposit
           */

          if (item.to) {
            return (
              <NavLink
                key={item.label}
                to={item.to}
                className={({ isActive }) =>
                  [
                    'client-nav-item',
                    item.className || '',
                    isActive
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
              className={`client-nav-item ${
                item.className || ''
              }`}
              onClick={() => handleAction(item)}
              aria-label={item.label}
            >
              <span className="client-nav-icon">
                {item.emoji}
              </span>

              <span className="client-nav-label">
                {item.label}
              </span>
            </button>
          );
        })}

      </div>
    </nav>
  );
};

export default LobbyBottomNav;