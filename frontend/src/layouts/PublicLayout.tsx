import { Outlet } from 'react-router-dom';

export function PublicLayout() {
  return (
    <div className="min-h-screen bg-dark-950">
      <Outlet />
    </div>
  );
}
