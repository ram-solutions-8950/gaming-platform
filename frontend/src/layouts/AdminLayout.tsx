import { useEffect, useState, useMemo } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { authService } from '../services/auth';
import { adminService, type TeamMember } from '../services/adminService';
import { soundManager } from '../services/soundManager';
import { APP_VERSION } from '../version';
import {
  LayoutDashboard,
  Users,
  Wallet,
  Gamepad2,
  Receipt,
  Gift,
  BarChart3,
  Settings,
  Bell,
  FileText,
  ShieldCheck,
  LifeBuoy,
  LogOut,
  Menu,
  Search,
  Calendar,
  ChevronDown,
  Crown,
} from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: any;
  permission?: string;
  badge?: string | number;
  subItems?: Array<{ to: string; label: string; permission?: string }>;
}

export function AdminLayout() {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'Users Management': true,
    'Wallet & Coins': true,
    'Games Management': true,
  });
  const [adminProfile, setAdminProfile] = useState<TeamMember | null>(null);
  const [unreadNotifs, setUnreadNotifs] = useState<number>(0);

  useEffect(() => {
    soundManager.stopAll();
    adminService.getCurrentAdminMe()
      .then(setAdminProfile)
      .catch(() => {});

    adminService.getNotifications(10)
      .then((data) => {
        if (data?.unread_count !== undefined) {
          setUnreadNotifs(data.unread_count);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await authService.logout();
    setUser(null);
    navigate('/admin/login');
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // RBAC Permission Check
  const hasAccess = (permission?: string): boolean => {
    if (!permission) return true;
    if (user?.role === 'SUPER_ADMIN') return true;
    if (!adminProfile?.permissions) return true;
    return adminProfile.permissions.includes(permission);
  };

  const navigationConfig: NavItem[] = useMemo(() => [
    {
      to: '/admin/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      permission: 'dashboard',
    },
    {
      to: '/admin/users',
      label: 'Users Management',
      icon: Users,
      permission: 'users',
      subItems: [
        { to: '/admin/users', label: 'All Users' },
        { to: '/admin/users?role=USER', label: 'Players' },
        { to: '/admin/users?role=ADMIN', label: 'Staff / Admins' },
        { to: '/admin/users?role=SUPER_ADMIN', label: 'Super Admins' },
        { to: '/admin/rbac', label: 'Team Roles & RBAC' },
      ],
    },
    {
      to: '/admin/deposits',
      label: 'Wallet & Coins',
      icon: Wallet,
      permission: 'wallet',
      subItems: [
        { to: '/admin/deposits', label: 'Deposit Approvals' },
        { to: '/admin/withdrawals', label: 'Withdrawal Requests' },
        { to: '/admin/wagers', label: 'Wager Settings' },
        { to: '/admin/transactions', label: 'Coin History' },
      ],
    },
    {
      to: '/admin/games',
      label: 'Games Management',
      icon: Gamepad2,
      permission: 'games',
      subItems: [
        { to: '/admin/catalog', label: 'Games Catalog' },
        { to: '/admin/games', label: 'Live Game Control' },
        { to: '/admin/winning-control', label: 'Winning & RTP Control' },
      ],
    },
    {
      to: '/admin/transactions',
      label: 'Transactions',
      icon: Receipt,
      permission: 'transactions',
      subItems: [
        { to: '/admin/transactions', label: 'All Transactions' },
        { to: '/admin/deposits', label: 'Deposit History' },
        { to: '/admin/withdrawals', label: 'Withdrawal History' },
      ],
    },
    {
      to: '/admin/rewards',
      label: 'Bonus & Promotions',
      icon: Gift,
      permission: 'rewards',
    },
    {
      to: '/admin/analytics',
      label: 'Reports & Analytics',
      icon: BarChart3,
      permission: 'analytics',
    },
    {
      to: '/admin/payment-settings',
      label: 'System Settings',
      icon: Settings,
      permission: 'settings',
      subItems: [
        { to: '/admin/payment-settings', label: 'Payment Settings' },
        { to: '/admin/fees', label: 'Fee Configuration' },
      ],
    },
    {
      to: '/admin/notifications',
      label: 'Notifications',
      icon: Bell,
      badge: unreadNotifs > 0 ? unreadNotifs : undefined,
    },
    {
      to: '/admin/audit-logs',
      label: 'Audit Logs',
      icon: FileText,
      permission: 'rbac',
    },
    {
      to: '/admin/rbac',
      label: 'RBAC & Permissions',
      icon: ShieldCheck,
      permission: 'rbac',
    },
    {
      to: '/admin/support',
      label: 'Support & Helpdesk',
      icon: LifeBuoy,
    },
  ], [adminProfile, user, unreadNotifs]);

  const filteredNav = navigationConfig.filter((item) => hasAccess(item.permission));

  const roleTitle = adminProfile?.team_role || (user?.role === 'SUPER_ADMIN' ? 'Administrator' : 'Admin Staff');

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-[#0a0e17] text-gray-200 antialiased font-sans">
      {/* Top Navbar matching Image 2 */}
      <header className="h-16 shrink-0 bg-[#0e1320] border-b border-[#1c2438] flex items-center justify-between px-4 sm:px-6 z-20 shadow-md">
        {/* Left: Brand Logo & Hamburger */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#1a2133] transition"
            title="Toggle Sidebar"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Crown className="w-5 h-5 text-gray-950 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-white text-base tracking-wider uppercase">GameMaster</span>
              </div>
              <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest block leading-none">ADMIN PANEL</span>
            </div>
          </div>
        </div>

        {/* Center: Global Search Bar */}
        <div className="hidden md:flex items-center flex-1 max-w-md mx-8">
          <div className="relative w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input
              type="text"
              placeholder="Search users, games, transactions..."
              className="w-full bg-[#141b2d] border border-[#222c44] rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition shadow-inner"
            />
          </div>
        </div>

        {/* Right: Date Range Selector, Notifications, Profile Avatar */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Date Selector Pill */}
          <div className="hidden lg:flex items-center gap-2 bg-[#141b2d] border border-[#222c44] px-3.5 py-1.5 rounded-xl text-xs text-gray-300 font-medium">
            <Calendar className="w-3.5 h-3.5 text-cyan-400" />
            <span>01 Sep 2024 - 30 Sep 2024</span>
            <ChevronDown className="w-3 h-3 text-gray-500 ml-1" />
          </div>

          {/* Notification Bell */}
          <button
            onClick={() => navigate('/admin/dashboard')}
            className="relative p-2 rounded-xl bg-[#141b2d] border border-[#222c44] text-gray-300 hover:text-white hover:bg-[#1a233a] transition"
            title="Notifications"
          >
            <Bell size={17} />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-[#0e1320]">
              5
            </span>
          </button>

          {/* User Profile Chip */}
          <div className="flex items-center gap-3 pl-2 border-l border-[#222c44]">
            <div className="relative">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center font-bold text-white shadow-md text-sm border border-cyan-400/30">
                {user?.name ? user.name.slice(0, 2).toUpperCase() : 'SA'}
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-[#0e1320]"></span>
            </div>
            <div className="hidden sm:block text-left">
              <span className="text-xs font-bold text-white block leading-tight truncate max-w-[120px]">
                {user?.name || 'Super Admin'}
              </span>
              <span className="text-[10px] font-semibold text-gray-400 leading-none">
                {roleTitle}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Body with Sidebar + Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? 'w-64' : 'w-0 -translate-x-full'
          } shrink-0 bg-[#0c101a] border-r border-[#1a2133] flex flex-col transition-all duration-300 ease-in-out overflow-hidden z-10`}
        >
          {/* Scrollable Navigation */}
          <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-1 custom-scrollbar">
            {filteredNav.map((item) => {
              const Icon = item.icon;
              const hasSub = item.subItems && item.subItems.length > 0;
              const isSectionExpanded = expandedSections[item.label] ?? false;
              const isActive = location.pathname === item.to || (hasSub && item.subItems?.some((s) => location.pathname === s.to));

              return (
                <div key={item.label} className="space-y-0.5">
                  <div
                    onClick={() => {
                      if (hasSub) {
                        toggleSection(item.label);
                      } else {
                        navigate(item.to);
                      }
                    }}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all duration-150 ${
                      isActive
                        ? 'bg-gradient-to-r from-blue-600/30 to-cyan-600/10 text-cyan-300 border-l-4 border-cyan-400 shadow-sm'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-[#131929]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-cyan-400' : 'text-gray-400'}`} />
                      <span className="truncate">{item.label}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.badge && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                          {item.badge}
                        </span>
                      )}
                      {hasSub && (
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-200 ${
                            isSectionExpanded ? 'rotate-180 text-cyan-400' : ''
                          }`}
                        />
                      )}
                    </div>
                  </div>

                  {/* Submenu */}
                  {hasSub && isSectionExpanded && (
                    <div className="pl-9 pr-2 py-1 space-y-1">
                      {item.subItems?.map((sub) => {
                        const isSubActive = location.pathname + location.search === sub.to || location.pathname === sub.to;
                        return (
                          <NavLink
                            key={sub.to + sub.label}
                            to={sub.to}
                            className={`block px-3 py-1.5 rounded-lg text-[11px] font-medium transition ${
                              isSubActive
                                ? 'text-cyan-400 bg-[#162035] font-bold'
                                : 'text-gray-400 hover:text-gray-200 hover:bg-[#111726]'
                            }`}
                          >
                            {sub.label}
                          </NavLink>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Sidebar Footer with Logout & Version */}
          <div className="shrink-0 p-3 border-t border-[#1a2133] bg-[#090d15]">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition"
            >
              <LogOut size={16} />
              <span>Sign Out</span>
            </button>
            <div className="mt-2 text-center">
              <span className="text-[10px] text-gray-600 font-mono tracking-wider">GameMaster Platform v{APP_VERSION}</span>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden bg-[#090d16] p-4 sm:p-6 lg:p-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
