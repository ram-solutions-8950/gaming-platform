import { useForm } from 'react-hook-form';
import { useNavigate, Link } from 'react-router-dom';
import { useState } from 'react';
import { authService } from '../../services/auth';
import { useAuthStore } from '../../store/authStore';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';

interface FormData { email: string; password: string; }

export function LoginPage() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useAuthStore();

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setError('');
    try {
      const res = await authService.login(data.email, data.password);
      if (res.success) {
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <h2 className="text-2xl font-bold text-white mb-1">Welcome back</h2>
      <p className="text-gray-400 text-sm mb-6">Sign in to your account</p>
      {error && <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg text-danger text-sm">{error}</div>}
      <Input id="email" label="Email" type="email" placeholder="you@example.com" {...register('email', { required: true })} error={errors.email ? 'Email is required' : ''} />
      <Input id="password" label="Password" type="password" placeholder="Password" {...register('password', { required: true })} error={errors.password ? 'Password is required' : ''} />
      <Button type="submit" className="w-full" loading={loading}>Sign in</Button>
      <p className="text-center text-sm text-gray-400">Don't have an account? <Link to="/signup" className="text-brand-400 hover:text-brand-300 font-medium">Sign up</Link></p>
    </form>
  );
}
