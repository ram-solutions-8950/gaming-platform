import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { createPortal } from 'react-dom';
import { registerPlugin } from '@capacitor/core';
import { Card } from '../../components/common/Card';
import api from '../../services/api';
import { isNativePlatform } from '../../utils/platform';

interface NativeCashfreeCheckoutPlugin {
  startCheckout(options: {
    orderId: string;
    paymentSessionId: string;
    mode: 'sandbox' | 'production';
  }): Promise<{ orderId: string; status: string }>;
}

const NativeCashfreeCheckout = registerPlugin<NativeCashfreeCheckoutPlugin>('CashfreeCheckout');

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayResponse) => void;
  modal?: {
    ondismiss?: () => void;
  };
  theme?: {
    color?: string;
  };
}

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  close: () => void;
}

interface ActiveGatewayConfig {
  active_gateway: string;
  display_name: string;
  is_sandbox: boolean;
  key_id?: string | null;
  app_id?: string | null;
  has_credentials?: boolean;
}

interface DepositResponse {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  provider: string;
  provider_order_id: string;
  currency: string;
  key_id?: string;
  payment_session_id?: string;
  environment?: string;
  app_id?: string;
  created_at: string;
}

function loadCashfreeScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as any).Cashfree) {
      resolve(true);
      return;
    }

    const existingScript = document.querySelector(
      'script[src="https://sdk.cashfree.com/js/v3/cashfree.js"]',
    );

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(true));
      existingScript.addEventListener('error', () => resolve(false));
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

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const existingScript = document.querySelector(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
    );

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(true));
      existingScript.addEventListener('error', () => resolve(false));
      return;
    }

    const script = document.createElement('script');

    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;

    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);

    document.body.appendChild(script);
  });
}

export function DepositPage() {
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [processing, setProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState('');
  const [deposit, setDeposit] = useState<DepositResponse | null>(null);
  const [gatewayConfig, setGatewayConfig] = useState<ActiveGatewayConfig | null>(null);
  const [cashfreeCheckoutOpen, setCashfreeCheckoutOpen] = useState(false);
  const cashfreeCheckoutRef = useRef<HTMLDivElement>(null);

  const minimumDeposit = 100;
  const maximumDeposit = 10000;

  useEffect(() => {
    let isMounted = true;
    api
      .get('/deposits/config')
      .then((res) => {
        if (isMounted && res.data?.data) {
          setGatewayConfig(res.data.data);
        }
      })
      .catch((err) => {
        console.warn('Failed to load active payment gateway config:', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleAmountChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setAmount(e.target.value);
    setAmountError('');
    setErrorMsg('');
    setPaymentStatus('');
  };

  const handleDepositSubmit = async () => {
    setAmountError('');
    setErrorMsg('');
    setPaymentStatus('');

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setAmountError(
        'Please enter a valid amount greater than ₹0.',
      );
      return;
    }

    const amountInPaise = Math.round(
      numericAmount * 100,
    );

    if (amountInPaise < minimumDeposit * 100) {
      setAmountError(
        `Minimum deposit is ₹${minimumDeposit}.`,
      );
      return;
    }

    if (amountInPaise > maximumDeposit * 100) {
      setAmountError(
        `Maximum deposit is ₹${maximumDeposit}.`,
      );
      return;
    }

    setProcessing(true);

    try {
      // 1. Create server-side deposit/order. Active gateway (Cashfree or Razorpay) is resolved on server.
      const response = await api.post(
        '/deposits',
        {
          amount: amountInPaise,
          provider: 'auto',
        },
      );

      const depositData =
        response.data.data as DepositResponse;

      setDeposit(depositData);

      if (depositData.provider === 'cashfree') {
        // Native Android uses Cashfree's activity SDK so control returns to the
        // app callback, never to the configured website return URL.
        let checkoutResult: any;
        const environment = depositData.environment === 'production' ? 'production' : 'sandbox';
        if (isNativePlatform()) {
          setPaymentStatus('Opening secure Cashfree checkout...');
          checkoutResult = await NativeCashfreeCheckout.startCheckout({
            orderId: depositData.provider_order_id,
            paymentSessionId: depositData.payment_session_id || '',
            mode: environment,
          });
        } else {
          setPaymentStatus('Loading Cashfree Checkout...');
          const cfLoaded = await loadCashfreeScript();
          if (!cfLoaded || !(window as any).Cashfree) {
            throw new Error('Unable to load Cashfree payment gateway.');
          }

          const cashfree = (window as any).Cashfree({ mode: environment });
          setCashfreeCheckoutOpen(true);
          await new Promise<void>((resolve) => {
            window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
          });

          const checkoutTarget = cashfreeCheckoutRef.current;
          if (!checkoutTarget) {
            throw new Error('Unable to open the embedded Cashfree checkout.');
          }

          checkoutResult = await cashfree.checkout({
            paymentSessionId: depositData.payment_session_id,
            redirectTarget: checkoutTarget,
            appearance: { width: '100%', height: '100%' },
          });
          setCashfreeCheckoutOpen(false);
        }

        if (checkoutResult?.error) {
          throw new Error(checkoutResult.error.message || 'Payment was cancelled.');
        }

        setPaymentStatus('Payment submitted. Verifying with server...');
        setErrorMsg('');

        let verified = false;
        let lastVerifyError: any;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          try {
            const verifyResponse = await api.post(
              `/deposits/${depositData.id}/verify`,
              {
                provider_order_id: depositData.provider_order_id,
                provider_payment_id: checkoutResult?.paymentDetails?.paymentMessage || depositData.provider_order_id,
                signature: 'cashfree_checkout',
              },
            );

            const verifiedDeposit = verifyResponse.data.data;
            setDeposit(verifiedDeposit);
            if (verifiedDeposit.status === 'SUCCESS') {
              setPaymentStatus('Payment successful! Your wallet has been credited.');
              verified = true;
              break;
            }

            lastVerifyError = new Error(`Payment status: ${verifiedDeposit.status}`);
            if (verifiedDeposit.status !== 'PENDING') {
              break;
            }
          } catch (verifyErr: any) {
            lastVerifyError = verifyErr;
            const message =
              verifyErr.response?.data?.message ||
              verifyErr.response?.data?.error?.message ||
              verifyErr.message || '';
            const stillPending = /status:\s*PENDING/i.test(message);

            if (!stillPending || attempt === 4) {
              break;
            }
          }

          if (attempt < 4) {
            await new Promise((resolve) => window.setTimeout(resolve, 2000));
          }
        }

        if (!verified) {
          const message =
            lastVerifyError?.response?.data?.message ||
            lastVerifyError?.response?.data?.error?.message ||
            lastVerifyError?.message || '';
          if (/status:\s*PENDING/i.test(message)) {
            setErrorMsg('');
            setPaymentStatus('Payment is still being confirmed. Please do not pay again; check your wallet shortly.');
          } else {
            setErrorMsg(message || 'Payment verification is pending. Please check your wallet shortly.');
            setPaymentStatus('');
          }
        }
        setProcessing(false);
      } else {
        // --- RAZORPAY CHECKOUT FLOW ---
        setPaymentStatus('Loading Razorpay Checkout...');
        const scriptLoaded =
          await loadRazorpayScript();

        if (!scriptLoaded) {
          throw new Error(
            'Unable to load Razorpay Checkout.',
          );
        }

        setPaymentStatus(
          'Opening secure Razorpay Checkout...',
        );

        const options: RazorpayOptions = {
          key: depositData.key_id || '',
          amount: depositData.amount,
          currency: depositData.currency || 'INR',
          name: 'Corona 888',
          description: 'Wallet Deposit',
          order_id:
            depositData.provider_order_id,

          handler: async (
            paymentResponse: RazorpayResponse,
          ) => {
            setProcessing(true);
            setPaymentStatus(
              'Payment received. Verifying with server...',
            );
            setErrorMsg('');

            try {
              const verifyResponse =
                await api.post(
                  `/deposits/${depositData.id}/verify`,
                  {
                    provider_order_id:
                      paymentResponse.razorpay_order_id,
                    provider_payment_id:
                      paymentResponse.razorpay_payment_id,
                    signature:
                      paymentResponse.razorpay_signature,
                  },
                );

              const verifiedDeposit =
                verifyResponse.data.data;

              setDeposit(verifiedDeposit);

              if (
                verifiedDeposit.status ===
                'SUCCESS'
              ) {
                setPaymentStatus(
                  'Payment successful. Your wallet has been credited.',
                );
              } else {
                setPaymentStatus(
                  `Payment status: ${verifiedDeposit.status}`,
                );
              }
            } catch (error: any) {
              setErrorMsg(
                error.response?.data?.error?.message ||
                  error.response?.data?.message ||
                  'Payment verification failed. Please contact support.',
              );
              setPaymentStatus('');
            } finally {
              setProcessing(false);
            }
          },

          modal: {
            ondismiss: () => {
              if (
                deposit?.status !== 'SUCCESS'
              ) {
                setProcessing(false);
                setPaymentStatus(
                  'Payment window closed. If you completed the payment, verification may still be processed by the server.',
                );
              }
            },
          },

          theme: {
            color: '#4f46e5',
          },
        };

        const razorpay =
          new window.Razorpay(options);

        razorpay.open();
      }
    } catch (error: any) {
      setCashfreeCheckoutOpen(false);
      setErrorMsg(
        error.response?.data?.error?.message ||
          error.message ||
          'Failed to start payment.',
      );
      setPaymentStatus('');
      setProcessing(false);
    }
  };

  const isCashfree = gatewayConfig?.active_gateway === 'cashfree';
  const cardTitle = gatewayConfig
    ? `${gatewayConfig.display_name} Deposit`
    : 'Secure Online Deposit';
  const buttonLabel = processing
    ? 'Processing...'
    : isCashfree
    ? 'Pay Securely via Cashfree ⚡'
    : gatewayConfig?.active_gateway === 'razorpay'
    ? 'Pay Securely via Razorpay ⚡'
    : `Pay Securely via ${gatewayConfig?.display_name || 'Gateway'} ⚡`;

  return (
    <div className="deposit-page w-full max-w-xl mx-auto space-y-4">
      <div className="deposit-page-header flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-900/60 hover:bg-purple-800/80 border border-purple-400/40 text-xs font-bold text-white transition active:scale-95 cursor-pointer shadow-md shrink-0"
            title="Go Back"
            aria-label="Go Back"
          >
            <ArrowLeft size={14} />
            <span>Back</span>
          </button>
          <h1 className="deposit-page-title text-xl sm:text-2xl font-extrabold text-white truncate">
            Deposit Funds
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {gatewayConfig?.is_sandbox && (
            <span className="text-[10px] text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0">
              Sandbox Mode
            </span>
          )}
          <span className="deposit-page-badge text-xs text-brand-400 bg-brand-500/10 border border-brand-500/20 px-2.5 py-1 rounded-full font-semibold shrink-0">
            Instant Credit ⚡
          </span>
        </div>
      </div>

      <Card title={cardTitle} className="deposit-card">
        <div className="deposit-card-body space-y-4">
          <div>
            <label className="deposit-amount-label block text-xs font-medium text-gray-400 mb-1.5">
              Enter Amount (₹)
            </label>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-400 font-bold text-base">
                  ₹
                </span>
              </div>

              <input
                type="number"
                min="100"
                max="10000"
                step="1"
                value={amount}
                onChange={handleAmountChange}
                disabled={processing}
                className="deposit-amount-input bg-dark-800 border border-dark-700 text-white rounded-xl pl-8 pr-4 py-2.5 w-full focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-base font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="e.g. 500"
              />
            </div>

            {/* Quick Presets */}
            <div className="deposit-presets-grid grid grid-cols-4 gap-2 mt-2.5">
              {[100, 500, 1000, 5000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setAmount(String(preset));
                    setAmountError('');
                    setErrorMsg('');
                  }}
                  className="deposit-preset-btn py-1.5 px-2 bg-dark-800 hover:bg-brand-600/30 text-gray-200 hover:text-white border border-dark-700 hover:border-brand-500/50 rounded-lg text-xs font-bold transition-all active:scale-95"
                >
                  +₹{preset}
                </button>
              ))}
            </div>

            <div className="deposit-limits-row mt-1.5 text-[11px] text-gray-500 flex justify-between">
              <span>Min: ₹100</span>
              <span>Max: ₹10,000</span>
            </div>

            {amountError && (
              <p className="mt-1.5 text-xs text-red-400 font-semibold">
                {amountError}
              </p>
            )}
          </div>

          {errorMsg && (
            <div className="bg-red-900/30 border border-red-500/40 rounded-xl p-2 text-red-200 text-xs font-semibold text-center">
              {errorMsg}
            </div>
          )}

          {!errorMsg && paymentStatus && (
            <div className="bg-brand-900/30 border border-brand-500/40 rounded-xl p-2 text-brand-200 text-xs font-medium text-center">
              {paymentStatus}
            </div>
          )}

          {deposit && deposit.status === 'SUCCESS' && (
            <div className="bg-emerald-950/60 rounded-xl p-2.5 text-xs space-y-1 border border-emerald-500/40">
              <div className="flex justify-between">
                <span className="text-gray-300">Order ID:</span>
                <span className="text-white font-mono">{deposit.id.slice(0, 12)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Amount Credited:</span>
                <span className="text-emerald-400 font-bold">₹{(deposit.amount / 100).toFixed(2)}</span>
              </div>
            </div>
          )}

          <button
            onClick={handleDepositSubmit}
            disabled={processing || !amount}
            className="deposit-submit-btn w-full bg-linear-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:from-dark-800 disabled:to-dark-800 disabled:text-gray-600 text-white font-extrabold py-3 px-4 rounded-xl shadow-lg shadow-green-600/20 transition-all cursor-pointer text-sm active:scale-95"
          >
            {buttonLabel}
          </button>
        </div>
      </Card>
      {cashfreeCheckoutOpen && createPortal(
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-slate-950/90 p-3 backdrop-blur-sm sm:p-5">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Secure Cashfree checkout"
            className="flex h-[calc(100dvh-24px)] w-full max-w-300 flex-col overflow-hidden rounded-2xl border border-white/15 bg-white shadow-2xl sm:h-[calc(100dvh-40px)]"
          >
            <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">Secure payment</p>
                <p className="text-[11px] text-slate-500">Complete your deposit using Cashfree</p>
              </div>
              <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                Encrypted checkout
              </span>
            </div>
            <div
              ref={cashfreeCheckoutRef}
              className="min-h-0 flex-1 overflow-auto bg-slate-100 [&>iframe]:block [&>iframe]:h-full [&>iframe]:w-full [&>iframe]:border-0"
            />
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}