import { useForm } from 'react-hook-form';
import { useNavigate, Link } from 'react-router-dom';
import { useState } from 'react';
import { authService } from '../../services/auth';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';

interface FormData { name: string; username: string; email: string; password: string; }

export function SignupPage() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onSubmit = async (data: FormData) => {
    setLoading(true); setError('');
    try {
      const res = await authService.register(data.name, data.username, data.email, data.password);
      if (res.success) navigate('/login');
      else setError(res.error?.message || 'Registration failed');
    } catch (e: any) {
      setError(e.response?.data?.error?.message || 'Registration failed');
    } finally { setLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <h2 className="text-2xl font-bold text-white mb-1">Create account</h2>
      <p className="text-gray-400 text-sm mb-6">Join GameStack today</p>
      {error && <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg text-danger text-sm">{error}</div>}
      <Input id="name" label="Full Name" placeholder="John Doe" {...register('name', { required: true })} error={errors.name ? 'Required' : ''} />
      <Input id="username" label="Username" placeholder="johndoe" {...register('username', { required: true })} error={errors.username ? 'Required' : ''} />
      <Input id="email" label="Email" type="email" placeholder="you@example.com" {...register('email', { required: true })} error={errors.email ? 'Required' : ''} />
      <Input id="password" label="Password" type="password" placeholder="Min 8 characters" {...register('password', { required: true, minLength: 8 })} error={errors.password ? 'Min 8 characters' : ''} />
      <Button type="submit" className="w-full" loading={loading}>Create account</Button>
      <p className="text-center text-sm text-gray-400">Already have an account? <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium">Sign in</Link></p>
    </form>
  );
}
