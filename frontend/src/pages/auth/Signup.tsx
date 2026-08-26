import { useForm } from 'react-hook-form';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { authService } from '../../services/auth';
import { GlitterRain } from '../../components/common/GlitterRain';
import { CasinoLogo } from '../../components/common/CasinoLogo';
import '../../styles/login-page.css';

interface FormData {
  name: string;
  username: string;
  email: string;
  password: string;
  referralCode?: string;
}

export function SignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const initialRef = searchParams.get('ref') || searchParams.get('referral_code') || '';

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      referralCode: initialRef,
    },
  });

  useEffect(() => {
    if (initialRef) {
      setValue('referralCode', initialRef);
    }
  }, [initialRef, setValue]);

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setError('');
    try {
      const res = await authService.register(
        data.name,
        data.username,
        data.email,
        data.password,
        data.referralCode
      );
      if (res.success) {
        navigate('/login');
      } else {
        setError(res.error?.message || 'Registration failed');
      }
    } catch (e: any) {
      setError(e.response?.data?.error?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-wrapper">
      <GlitterRain />

      <div className="casino-login-card">
        {/* Header */}
        <div className="casino-login-header">
          <CasinoLogo size="md" showSubtitle={false} />
          <p className="casino-login-subtitle">Create your account</p>
        </div>

        {/* Signup Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="casino-login-form" noValidate>
          {error && (
            <div className="casino-login-error" role="alert">
              {error}
            </div>
          )}

          <div className="casino-input-group">
            <label htmlFor="name" className="casino-input-label">Full Name</label>
            <input
              id="name"
              placeholder="John Doe"
              className="casino-input-field"
              {...register('name', { required: 'Full name is required' })}
            />
            {errors.name && <span className="casino-field-error">{errors.name.message}</span>}
          </div>

          <div className="casino-input-group">
            <label htmlFor="username" className="casino-input-label">Username</label>
            <input
              id="username"
              placeholder="johndoe"
              className="casino-input-field"
              {...register('username', { required: 'Username is required' })}
            />
            {errors.username && <span className="casino-field-error">{errors.username.message}</span>}
          </div>

          <div className="casino-input-group">
            <label htmlFor="email" className="casino-input-label">Email</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              className="casino-input-field"
              {...register('email', { required: 'Email is required' })}
            />
            {errors.email && <span className="casino-field-error">{errors.email.message}</span>}
          </div>

          <div className="casino-input-group">
            <label htmlFor="password" className="casino-input-label">Password</label>
            <div className="password-input-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Min 8 characters"
                className="casino-input-field"
                {...register('password', { required: 'Password is required', minLength: { value: 8, message: 'Min 8 characters' } })}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={0}
              >
                {showPassword ? <EyeOff size={18} strokeWidth={2.2} /> : <Eye size={18} strokeWidth={2.2} />}
              </button>
            </div>
            {errors.password && <span className="casino-field-error">{errors.password.message}</span>}
          </div>

          <div className="casino-input-group">
            <label htmlFor="referralCode" className="casino-input-label flex items-center justify-between">
              <span>Referral Code <span className="text-gray-500 font-normal text-xs">(Optional)</span></span>
              {initialRef && <span className="text-gold-400 text-xs font-semibold">🎁 Applied</span>}
            </label>
            <input
              id="referralCode"
              placeholder="e.g. A1B2C3D4"
              className={`casino-input-field uppercase tracking-wider font-mono ${initialRef ? 'border-gold-500/50 bg-gold-500/5' : ''}`}
              {...register('referralCode')}
            />
          </div>

          <button
            type="submit"
            className="casino-login-btn"
            disabled={loading}
          >
            {loading ? 'Creating Account...' : 'Sign Up & Play'}
          </button>

          <p className="casino-login-footer">
            Already have an account?
            <Link to="/login" className="casino-login-link">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
