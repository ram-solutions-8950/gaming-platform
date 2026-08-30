import { Outlet } from 'react-router-dom';

export function AuthLayout() {
  return (
    <div className="auth-layout w-full min-h-screen relative overflow-x-hidden">
      <Outlet />
    </div>
  );
}

