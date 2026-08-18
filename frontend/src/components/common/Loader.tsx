export function Loader({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sz = { sm: 'w-5 h-5', md: 'w-8 h-8', lg: 'w-12 h-12' }[size];
  return (
    <div className="flex items-center justify-center p-8">
      <div className={`${sz} border-2 border-dark-600 border-t-brand-500 rounded-full animate-spin`} />
    </div>
  );
}
