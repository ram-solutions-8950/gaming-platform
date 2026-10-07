import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, ArrowLeft, RefreshCw } from 'lucide-react';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Cashfree: any;
  }
}

function loadCashfreeSDK(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.Cashfree) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function CashfreePayPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const sessionId =
    searchParams.get('session_id') ||
    searchParams.get('payment_session_id') ||
    '';
  const orderId = searchParams.get('order_id') || '';
  const mode = searchParams.get('mode') || 'production';
  const rawAmount = searchParams.get('amount') || '';
  const returnUrl = searchParams.get('return_url') || '/wallet';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const hasTriggeredRef = useRef(false);

  const amountDisplay = rawAmount
    ? Number(rawAmount) > 100
      ? (Number(rawAmount) / 100).toFixed(2)
      : Number(rawAmount).toFixed(2)
    : '';

  useEffect(() => {
    let isMounted = true;

    async function init() {
      if (!sessionId) {
        setError('Missing Cashfree payment session ID.');
        setLoading(false);
        return;
      }

      try {
        const loaded = await loadCashfreeSDK();
        if (!loaded || !window.Cashfree) {
          throw new Error('Failed to load Cashfree payment SDK.');
        }

        if (isMounted) {
          setSdkReady(true);
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to initialize payment gateway.');
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  const handleStartPayment = async () => {
    if (!sessionId || !window.Cashfree) return;
    setError(null);
    setLoading(true);

    try {
      const cashfree = window.Cashfree({
        mode: mode === 'sandbox' ? 'sandbox' : 'production',
      });

      await cashfree.checkout({
        paymentSessionId: sessionId,
        redirectTarget: '_self',
      });
    } catch (err: any) {
      setError(err.message || 'Failed to open Cashfree checkout.');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sdkReady && sessionId && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
      const timer = setTimeout(() => {
        handleStartPayment();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [sdkReady, sessionId]);

  return (
    <div className="min-h-screen bg-dark-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-dark-900 border border-dark-800 rounded-2xl p-6 shadow-2xl text-center">
        <div className="w-16 h-16 bg-brand-500/10 border border-brand-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 text-brand-400">
          <ShieldCheck className="w-8 h-8" />
        </div>

        <h1 className="text-2xl font-black text-white tracking-tight">
          Secure Payment Checkout
        </h1>
        <p className="text-xs text-gray-400 mt-1">
          Poland Exim &bull; Cashfree Verified Portal
        </p>

        {orderId && (
          <div className="mt-5 w-full bg-dark-800/60 rounded-xl p-3 border border-dark-700/60 flex justify-between items-center text-xs">
            <span className="text-gray-400">Order ID:</span>
            <span className="font-mono font-semibold text-gray-200 break-all">
              {orderId}
            </span>
          </div>
        )}

        {amountDisplay && (
          <div className="mt-2 w-full bg-brand-500/10 rounded-xl p-3 border border-brand-500/20 flex justify-between items-center text-sm">
            <span className="text-gray-300 font-medium">Amount to Pay:</span>
            <span className="text-xl font-black text-brand-400">
              ₹{amountDisplay}
            </span>
          </div>
        )}

        {error ? (
          <div className="mt-6 w-full p-4 bg-red-900/30 border border-red-700/40 rounded-xl text-red-300 text-xs text-left">
            <p className="font-bold">Payment Error</p>
            <p className="mt-1">{error}</p>
            <button
              onClick={handleStartPayment}
              className="mt-3 w-full py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition"
            >
              Retry Payment
            </button>
          </div>
        ) : loading ? (
          <div className="mt-8 flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 text-brand-400 animate-spin" />
            <p className="text-sm font-semibold text-gray-200">
              Opening secure Cashfree checkout...
            </p>
            <p className="text-xs text-gray-400">
              Please do not close this window.
            </p>
          </div>
        ) : (
          <div className="mt-6 w-full space-y-3">
            <button
              onClick={handleStartPayment}
              className="w-full py-3.5 bg-brand-600 hover:bg-brand-500 text-white font-extrabold rounded-xl shadow-lg shadow-brand-500/20 transition cursor-pointer flex items-center justify-center gap-2"
            >
              <Lock className="w-5 h-5" />
              <span>Proceed to Cashfree Checkout</span>
            </button>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-dark-800 flex items-center justify-center gap-2 text-[11px] text-gray-500">
          <Lock className="w-3.5 h-3.5 text-emerald-400" />
          <span>256-Bit SSL Encrypted &bull; PCI-DSS Compliant</span>
        </div>

        <button
          onClick={() => {
            if (returnUrl.startsWith('http')) {
              window.location.href = returnUrl;
            } else {
              navigate(returnUrl);
            }
          }}
          className="mt-4 inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Wallet</span>
        </button>
      </div>
    </div>
  );
}
