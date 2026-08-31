import { useForm } from 'react-hook-form';
import { useNavigate, Link } from 'react-router-dom';
import { useState } from 'react';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { authService } from '../../services/auth';
import { useAuthStore } from '../../store/authStore';
import { GlitterRain } from '../../components/common/GlitterRain';
import splashBg from '../../assets/corona888-logo.webp';
import '../../styles/login-page.css';

interface FormData {
  email: string;
  password: string;
}

export function LoginPage() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useAuthStore();

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setError('');
    try {
      const res = await authService.login(data.email, data.password);
      if (res.success) {
        try {
          sessionStorage.removeItem('referral_popup_shown_this_session');
        } catch {}
        const me = await authService.me();
        setUser(me);
        navigate(me.role === 'USER' ? '/dashboard' : '/admin/dashboard');
      } else {
        setError(res.error?.message || 'Login failed');
      }
    } catch (e: any) {
      setError(e.response?.data?.error?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="auth-page-wrapper"
      style={{
        backgroundImage: `linear-gradient(rgba(3, 6, 16, 0.15), rgba(3, 6, 16, 0.32)), url(${splashBg})`,
      }}
    >
      <GlitterRain />

      <div className="casino-login-card">
        {/* Logo & Subtitle */}
        <div className="casino-login-header">
          <h2 className="casino-login-title">WELCOME BACK</h2>
          <p className="casino-login-subtitle">Login to continue your winning journey</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="casino-login-form" noValidate>
          {error && (
            <div className="casino-login-error" role="alert">
              {error}
            </div>
          )}

          {/* Email Input */}
          <div className="casino-input-group">
            <label htmlFor="email" className="casino-input-label">
              Email
            </label>
            <div className="casino-input-wrapper">
              <Mail className="casino-input-icon" size={18} />
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                className="casino-input-field with-icon"
                {...register('email', { required: 'Email is required' })}
              />
            </div>
            {errors.email && (
              <span className="casino-field-error">{errors.email.message}</span>
            )}
          </div>

          {/* Password Input with Visibility Toggle */}
          <div className="casino-input-group">
            <label htmlFor="password" className="casino-input-label">
              Password
            </label>
            <div className="casino-input-wrapper password-input-wrapper">
              <Lock className="casino-input-icon" size={18} />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
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

          {/* Casino Gold Submit Button */}
          <button
            type="submit"
            className="casino-login-btn"
            disabled={loading}
          >
            {loading ? 'Signing In...' : 'Sign in to Play'}
          </button>

          {/* Footer Link */}
          <p className="casino-login-footer">
            Don't have an account?{' '}
            <Link to="/signup" className="casino-login-link">
              Sign up
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
