import { useEffect, useState } from 'react';
import { systemService, type AppVersionInfo } from '../../services/systemService';
import { APP_VERSION } from '../../version';
import { isNativePlatform } from '../../utils/platform';
import { Download, Sparkles, X, ArrowRight, ShieldCheck, Rocket, Zap } from 'lucide-react';

function isNewerVersion(latest: string, current: string): boolean {
  try {
    const lParts = latest.replace(/^[vV]/, '').split('.').map((n) => parseInt(n, 10) || 0);
    const cParts = current.replace(/^[vV]/, '').split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(lParts.length, cParts.length); i++) {
      const l = lParts[i] || 0;
      const c = cParts[i] || 0;
      if (l > c) return true;
      if (l < c) return false;
    }
    return false;
  } catch {
    return false;
  }
}

export function AppUpdateModal() {
  const [updateInfo, setUpdateInfo] = useState<AppVersionInfo | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Don't show APK update prompt on admin portal
    const isAdmin = typeof window !== 'undefined' && (
      window.location.hostname.startsWith('admin.') ||
      window.location.hostname === 'admin.corona888.tech' ||
      window.location.hostname === 'admin.crona888.com' ||
      window.location.pathname.startsWith('/admin')
    );
    if (isAdmin) return;

    // Check if dismissed in this session
    const dismissedVer = sessionStorage.getItem('dismissed_update_version');

    systemService
      .getAppVersion()
      .then((info) => {
        if (info && info.latest_version) {
          setUpdateInfo(info);
          if (isNewerVersion(info.latest_version, APP_VERSION)) {
            if (!info.force_update && dismissedVer === info.latest_version) {
              return;
            }
            setIsOpen(true);
            requestAnimationFrame(() => {
              requestAnimationFrame(() => setMounted(true));
            });
          }
        }
      })
      .catch(() => {
        // Silently ignore if offline
      });
  }, []);

  if (!isOpen || !updateInfo) return null;

  const handleDismiss = () => {
    if (updateInfo.force_update) return;
    setMounted(false);
    setTimeout(() => {
      sessionStorage.setItem('dismissed_update_version', updateInfo.latest_version);
      setIsOpen(false);
    }, 300);
  };

  const handleDownload = () => {
    setDownloading(true);
    const link = document.createElement('a');
    const downloadUrl = updateInfo.download_url || '/Corona888.apk';
    link.href = isNativePlatform() && downloadUrl.startsWith('/')
      ? `https://polandexim.com${downloadUrl}`
      : downloadUrl;
    link.setAttribute('download', 'Corona888.apk');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => setDownloading(false), 3000);
  };

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center p-3 select-none"
      style={{
        backgroundColor: mounted ? 'rgba(0,0,0,0.88)' : 'rgba(0,0,0,0)',
        backdropFilter: mounted ? 'blur(16px)' : 'blur(0)',
        transition: 'background-color 0.4s ease, backdrop-filter 0.4s ease',
      }}
    >
      {/* Inline keyframes for animations */}
      <style>{`
        @keyframes update-modal-spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes update-modal-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes update-modal-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes update-modal-pulse-ring {
          0% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.15); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
        @keyframes update-modal-dot-pulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      <div
        className="relative w-full max-w-[380px]"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(20px)',
          transition: 'opacity 0.4s cubic-bezier(0.16,1,0.3,1), transform 0.4s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {/* Rotating gradient border */}
        <div
          className="absolute -inset-[2px] rounded-[28px] opacity-70"
          style={{
            background: 'conic-gradient(from 0deg, #a855f7, #06b6d4, #10b981, #eab308, #f43f5e, #a855f7)',
            animation: 'update-modal-spin-slow 6s linear infinite',
          }}
        />

        {/* Card body */}
        <div className="relative rounded-[26px] bg-gradient-to-b from-[#13082a] via-[#0d0420] to-[#080115] overflow-hidden">
          {/* Ambient glow orbs */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-purple-500/20 rounded-full blur-[80px] pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-32 h-32 bg-cyan-500/15 rounded-full blur-[60px] pointer-events-none" />
          <div className="absolute top-1/2 left-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-[50px] pointer-events-none" />

          {/* Inner glass panel */}
          <div className="relative px-6 pt-7 pb-6">
            {/* Close button */}
            {!updateInfo.force_update && (
              <button
                onClick={handleDismiss}
                className="absolute top-3.5 right-3.5 p-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-gray-400 hover:text-white transition-all duration-200 cursor-pointer backdrop-blur-sm"
                aria-label="Close"
              >
                <X size={15} strokeWidth={2.5} />
              </button>
            )}

            {/* Icon + Badge */}
            <div className="flex flex-col items-center text-center">
              {/* App Icon */}
              <div
                className="relative mb-4"
                style={{ animation: 'update-modal-float 3s ease-in-out infinite' }}
              >
                {/* Pulse ring behind icon */}
                <div
                  className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-purple-500 to-cyan-400"
                  style={{ animation: 'update-modal-pulse-ring 2s ease-in-out infinite' }}
                />
                <div className="relative w-[60px] h-[60px] rounded-2xl bg-gradient-to-br from-purple-500 via-violet-600 to-indigo-700 p-[2px] shadow-xl shadow-purple-600/30">
                  <div className="w-full h-full bg-[#0e0525] rounded-[14px] flex items-center justify-center">
                    <Rocket size={26} className="text-purple-300" />
                  </div>
                </div>
                {/* Notification dot */}
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-400 border-2 border-[#0e0525]" />
                </span>
              </div>

              {/* Badge pill */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-[0.12em] bg-gradient-to-r from-cyan-500/15 to-purple-500/15 text-cyan-300 border border-cyan-400/25 mb-3 backdrop-blur-sm">
                <Zap size={10} className="text-cyan-400" />
                New Version Available
              </div>

              {/* Title */}
              <h3 className="text-lg font-black text-white tracking-tight leading-tight mb-1">
                Update to v{updateInfo.latest_version}
              </h3>

              {/* Version comparison */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.06] mb-5">
                <span className="text-[11px] text-gray-500 font-mono font-medium">v{APP_VERSION}</span>
                <div className="flex items-center gap-0.5">
                  <div className="w-4 h-[1px] bg-gradient-to-r from-gray-600 to-cyan-500" />
                  <ArrowRight size={10} className="text-cyan-400" />
                </div>
                <span className="text-[11px] text-emerald-400 font-mono font-bold">v{updateInfo.latest_version}</span>
              </div>

              {/* Release notes */}
              <div className="w-full bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 text-left mb-5 backdrop-blur-sm">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <div className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-500/15">
                    <Sparkles size={11} className="text-amber-400" />
                  </div>
                  <span className="text-[11px] font-bold text-amber-300/90 uppercase tracking-wider">What's New</span>
                </div>
                <p className="text-[12px] text-gray-400 leading-[1.6] font-medium">
                  {updateInfo.release_notes || 'Major performance enhancements, new payment gateways, and instant ticket support.'}
                </p>
              </div>

              {/* CTA Button */}
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="group relative w-full py-3.5 px-5 rounded-2xl font-extrabold text-[13px] uppercase tracking-wider text-white overflow-hidden transition-all duration-300 active:scale-[0.97] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background: downloading
                    ? 'linear-gradient(135deg, #374151, #1f2937)'
                    : 'linear-gradient(135deg, #059669, #0d9488, #0891b2)',
                  boxShadow: downloading
                    ? 'none'
                    : '0 8px 32px rgba(5,150,105,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
                }}
              >
                {/* Shimmer overlay */}
                {!downloading && (
                  <div
                    className="absolute inset-0 opacity-30"
                    style={{
                      background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.4) 50%, transparent 60%)',
                      animation: 'update-modal-shimmer 2.5s ease-in-out infinite',
                    }}
                  />
                )}
                <div className="relative flex items-center justify-center gap-2.5">
                  {downloading ? (
                    <>
                      {/* Animated dots */}
                      <div className="flex items-center gap-1">
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full bg-white"
                            style={{
                              animation: `update-modal-dot-pulse 1.2s ease-in-out ${i * 0.15}s infinite`,
                            }}
                          />
                        ))}
                      </div>
                      <span>Downloading...</span>
                    </>
                  ) : (
                    <>
                      <Download size={16} strokeWidth={2.5} />
                      <span>Download & Update</span>
                    </>
                  )}
                </div>
              </button>

              {/* Dismiss */}
              {!updateInfo.force_update && (
                <button
                  onClick={handleDismiss}
                  className="mt-3 py-2 text-[11px] font-semibold text-gray-500 hover:text-gray-300 transition-colors duration-200 cursor-pointer"
                >
                  Remind Me Later
                </button>
              )}

              {/* Trust badge */}
              <div className="flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full bg-emerald-500/[0.06] border border-emerald-500/[0.1]">
                <ShieldCheck size={11} className="text-emerald-400/80" />
                <span className="text-[9px] text-gray-500 font-medium tracking-wide">
                  Official Verified Corona888 APK
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
