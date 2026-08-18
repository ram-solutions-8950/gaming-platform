import { Outlet } from 'react-router-dom';

export function AuthLayout() {
  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-linear-to-br from-brand-500 to-gold-500 rounded-xl flex items-center justify-center text-2xl text-white">G</div>
            <span className="text-2xl font-extrabold text-white tracking-tight">GameStack</span>
          </div>
          <p className="text-gray-400 text-sm">Premium Gaming Platform</p>
        </div>
        <div className="bg-dark-900 border border-dark-700 rounded-2xl p-8 shadow-2xl">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
