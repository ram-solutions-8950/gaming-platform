import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { authService } from '../../services/auth';
import { useAuthStore } from '../../store/authStore';
import { GlitterRain } from '../../components/common/GlitterRain';
import { isNativePlatform } from '../../utils/platform';
import { soundManager } from '../../services/soundManager';
import '../../styles/login-page.css';
import { getApiErrorMessage } from '../../utils/apiError';

interface FormData {
  email: string;
  password: string;
}

export function LoginPage() {
  const isAdminRoute = typeof window !== 'undefined' && window.location.pathname.toLowerCase().includes('admin');
  const savedEmail = typeof window !== 'undefined' ? localStorage.getItem('saved_email') || '' : '';
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      email: savedEmail,
      password: '',
    },
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useAuthStore();

  useEffect(() => {
    // Strictly stop all sound playback on login page (Bug-001)
    soundManager.stopAll();
  }, []);

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setError('');
    try {
      if (rememberMe && typeof window !== 'undefined') {
        localStorage.setItem('saved_email', data.email);
      } else if (typeof window !== 'undefined') {
        localStorage.removeItem('saved_email');
      }

      const isApp = isNativePlatform();
      const res = await authService.login(data.email, data.password, isApp ? 'apk' : 'web');
      if (res.success) {
        try {
          sessionStorage.removeItem('referral_popup_shown_this_session');
        } catch {}
        const me = await authService.me();
        if (isApp && me.role !== 'USER') {
          await authService.logout();
          setUser(null);
          setError('Admin accounts cannot log in via the mobile application. Please use the Web Admin Portal.');
          return;
        }
        if (isAdminRoute && me.role !== 'ADMIN' && me.role !== 'SUPER_ADMIN') {
          await authService.logout();
          setUser(null);
          setError('Access denied. Administrator privileges required.');
          return;
        }
        setUser(me);
        navigate(me.role === 'USER' ? '/dashboard' : '/admin/dashboard');
      } else {
        setError(res.error?.message || 'Login failed');
      }
    } catch (e: any) {
      const backendMsg = getApiErrorMessage(e, 'Login failed');
      setError(backendMsg || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`auth-page-wrapper ${isAdminRoute ? 'admin-auth-page-wrapper' : ''}`}>
      {!isAdminRoute && <GlitterRain />}

      <div className={`casino-login-card ${isAdminRoute ? 'admin-login-card' : ''}`}>
        {/* Logo & Subtitle */}
        <div className="casino-login-header">
          {isAdminRoute ? (
            <div className="flex flex-col items-center gap-2 mb-2">
              <div className="relative w-14 h-14 rounded-2xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.25)]">
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-900 shadow-[0_0_8px_#34d399]" />
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/40 border border-cyan-500/30 text-[11px] font-bold text-cyan-300 uppercase tracking-widest mt-1">
                <span>✦</span>
                <span>CORONA888 ENTERPRISE SECURITY</span>
              </div>
              <h2 className="casino-login-title text-2xl font-black text-white mt-1">Admin Portal</h2>
              <p className="casino-login-subtitle text-slate-400 text-xs font-medium">
                Access platform governance, analytics & operations
              </p>
            </div>
          ) : (
            <>
              <h2 className="casino-login-title">WELCOME BACK</h2>
              <p className="casino-login-subtitle">Enter your credentials to continue</p>
            </>
          )}
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="casino-login-form" noValidate>
          {error && (
            <div className="casino-login-error" role="alert">
              {error}
            </div>
          )}

          {/* Email / Admin ID Input */}
          <div className="casino-input-group">
            <label htmlFor="email" className="casino-input-label">
              {isAdminRoute ? 'Admin ID' : 'Email'}
            </label>
            <div className="casino-input-wrapper">
              <Mail className="casino-input-icon" size={18} />
              <input
                id="email"
                type="email"
                placeholder={isAdminRoute ? 'admin@corona888.com' : 'you@example.com'}
                autoComplete="email"
                className="casino-input-field with-icon"
                {...register('email', { required: isAdminRoute ? 'Admin ID is required' : 'Email is required' })}
              />
            </div>
            {errors.email && (
              <span className="casino-field-error">{errors.email.message}</span>
            )}
          </div>

          {/* Password Input with Visibility Toggle */}
          <div className="casino-input-group">
            <label htmlFor="password" className="casino-input-label">
              {isAdminRoute ? 'Security Password' : 'Password'}
            </label>
            <div className="casino-input-wrapper password-input-wrapper">
              <Lock className="casino-input-icon" size={18} />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder={isAdminRoute ? 'Security Password' : 'Password'}
                autoComplete="current-password"
                className="casino-input-field with-icon with-toggle"
                {...register('password', { required: 'Password is required' })}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={0}
              >
                {showPassword ? (
                  <EyeOff size={18} strokeWidth={2.2} />
                ) : (
                  <Eye size={18} strokeWidth={2.2} />
                )}
              </button>
            </div>
            {errors.password && (
              <span className="casino-field-error">{errors.password.message}</span>
            )}
          </div>

          {/* Remember Me Checkbox */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: '#cbd5e1' }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ accentColor: isAdminRoute ? '#06b6d4' : '#eab308', width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span>Remember ID & Password</span>
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className={isAdminRoute ? 'admin-login-btn' : 'casino-login-btn'}
            disabled={loading}
          >
            {loading
              ? 'Signing In...'
              : isAdminRoute
              ? 'Sign In to Dashboard →'
              : 'Sign in to Play'}
          </button>

          {/* Footer Link / Security Notice */}
          {isAdminRoute ? (
            <p className="text-center text-[11px] text-slate-500 font-medium mt-3 tracking-wide">
              Protected by end-to-end encrypted admin token authorization.
            </p>
          ) : (
            <p className="casino-login-footer">
              Don't have an account?{' '}
              <Link to="/signup" className="casino-login-link">
                Sign up
              </Link>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
