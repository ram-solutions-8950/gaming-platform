import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, CheckCircle2, Copy, QrCode } from 'lucide-react';
import { createPortal } from 'react-dom';
import { registerPlugin } from '@capacitor/core';
import { Card } from '../../components/common/Card';
import api from '../../services/api';
import { isNativePlatform } from '../../utils/platform';
import { getMediaUrl } from '../../utils/media';

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

interface ManualPaymentConfig {
  id: string;
  display_name: string;
  upi_id: string;
  qr_code_url?: string | null;
  minimum_deposit: number;
  maximum_deposit: number;
  deposit_instructions?: string | null;
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
  transaction_id?: string | null;
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
  const [manualConfigs, setManualConfigs] = useState<ManualPaymentConfig[]>([]);
  const [selectedManualConfigId, setSelectedManualConfigId] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [manualRemarks, setManualRemarks] = useState('');
  const [manualError, setManualError] = useState('');
  const [manualStatus, setManualStatus] = useState('');
  const [manualProcessing, setManualProcessing] = useState(false);
  const [manualDeposit, setManualDeposit] = useState<DepositResponse | null>(null);
  const [upiCopied, setUpiCopied] = useState(false);
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
          const configs = res.data.data.manual_configs || (res.data.data.manual_payment ? [res.data.data.manual_payment] : []);
          setManualConfigs(configs);
          setSelectedManualConfigId(configs[0]?.id || '');
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
          const checkoutPromise = NativeCashfreeCheckout.startCheckout({
            orderId: depositData.provider_order_id,
            paymentSessionId: depositData.payment_session_id || '',
            mode: environment,
          });
          // Safety timeout – if the native plugin never calls back (e.g. SDK
          // crash or Activity not launched), unblock the UI after 2 minutes.
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(
              'Cashfree checkout timed out. The payment window may not have opened. Please try again.'
            )), 120_000);
          });
          checkoutResult = await Promise.race([checkoutPromise, timeoutPromise]);
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

  const selectedManualConfig = manualConfigs.find((config) => config.id === selectedManualConfigId) || manualConfigs[0];

  const handleManualDepositSubmit = async () => {
    setManualError('');
    setManualStatus('');
    const numericAmount = Number(manualAmount);
    const minAmount = selectedManualConfig.minimum_deposit / 100;
    const maxAmount = selectedManualConfig.maximum_deposit / 100;
    if (!Number.isFinite(numericAmount) || numericAmount < minAmount || numericAmount > maxAmount) {
      setManualError(`Enter an amount between ₹${minAmount} and ₹${maxAmount}.`);
      return;
    }
    const trimmedTransactionId = transactionId.trim();
    if (trimmedTransactionId.length < 4 || trimmedTransactionId.length > 255) {
      setManualError('Enter a valid UTR / transaction ID (4–255 characters).');
      return;
    }

    setManualProcessing(true);
    try {
      const response = await api.post('/deposits/manual', {
        amount: Math.round(numericAmount * 100),
        transaction_id: trimmedTransactionId,
        config_id: selectedManualConfig.id,
        remarks: manualRemarks.trim() || undefined,
      });
      setManualDeposit(response.data.data);
      setManualStatus('Payment details submitted. Your wallet will be credited after admin verification.');
      setTransactionId('');
      setManualRemarks('');
    } catch (error: any) {
      setManualError(
        error.response?.data?.error?.message ||
        error.response?.data?.message ||
        'Could not submit your payment details. Please try again.',
      );
    } finally {
      setManualProcessing(false);
    }
  };

  const copyUpiId = async () => {
    if (!selectedManualConfig?.upi_id || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(selectedManualConfig.upi_id);
      setUpiCopied(true);
      window.setTimeout(() => setUpiCopied(false), 1800);
    } catch {
      setManualError('Could not copy the UPI ID. Please copy it manually.');
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
    <div className="deposit-page w-full max-w-5xl mx-auto space-y-4">
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

      <div className={`deposit-grid grid grid-cols-1 ${selectedManualConfig ? 'md:grid-cols-2' : 'single-card max-w-xl mx-auto'} gap-4 items-start`}>
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
                  className="deposit-preset-btn py-1.5 px-2 bg-dark-800 hover:bg-brand-600/30 text-gray-200 hover:text-white border border-dark-700 hover:border-brand-500/50 rounded-lg text-xs font-bold transition-all active:scale-95 cursor-pointer"
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

      {selectedManualConfig && (
        <Card title={selectedManualConfig.display_name || 'Manual UPI & QR Deposit'} className="deposit-card">
          <div className="deposit-card-body space-y-3 sm:space-y-4">
            {manualConfigs.length > 1 && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Choose Deposit Method
                </label>
                <select
                  value={selectedManualConfigId}
                  onChange={(event) => setSelectedManualConfigId(event.target.value)}
                  className="w-full rounded-xl border border-dark-700 bg-dark-800 px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-brand-500"
                >
                  {manualConfigs.map((config) => (
                    <option key={config.id} value={config.id}>
                      {config.display_name} ({config.upi_id})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* QR Code and UPI ID Row */}
            <div className="flex items-center gap-3.5 rounded-xl border border-dark-700 bg-dark-800/80 p-3">
              {selectedManualConfig.qr_code_url ? (
                <div className="shrink-0 p-1.5 bg-white rounded-xl shadow-md border border-gray-600 flex items-center justify-center">
                  <img
                    src={getMediaUrl(selectedManualConfig.qr_code_url)}
                    alt={`${selectedManualConfig.display_name} QR`}
                    className="h-28 w-28 object-contain rounded"
                    onError={(e) => {
                      const target = e.currentTarget;
                      const src = target.src;
                      if (selectedManualConfig.qr_code_url && !src.includes('/api/v1/uploads')) {
                        target.src = getMediaUrl(`/api/v1${selectedManualConfig.qr_code_url.startsWith('/') ? '' : '/'}${selectedManualConfig.qr_code_url}`);
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="flex h-28 w-28 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-dark-600 text-gray-500 bg-dark-900/50">
                  <QrCode size={32} />
                  <span className="mt-1 text-[10px]">Scan &amp; Pay</span>
                </div>
              )}

              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-[11px] font-semibold text-gray-400">Official UPI ID</p>
                <div className="flex items-center gap-1.5 rounded-lg border border-dark-700 bg-dark-900 px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs font-bold text-amber-300">
                    {selectedManualConfig.upi_id}
                  </span>
                  <button
                    type="button"
                    onClick={copyUpiId}
                    className="shrink-0 rounded p-1 text-gray-400 hover:bg-dark-700 hover:text-white transition cursor-pointer"
                    title="Copy UPI ID"
                    aria-label="Copy UPI ID"
                  >
                    {upiCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
                <div className="flex items-center justify-between text-[10px] text-gray-400">
                  <span>Min: ₹{selectedManualConfig.minimum_deposit / 100}</span>
                  <span>Max: ₹{selectedManualConfig.maximum_deposit / 100}</span>
                </div>
                {upiCopied && (
                  <p className="text-[10px] text-emerald-400 font-semibold animate-pulse">✓ UPI ID copied to clipboard</p>
                )}
              </div>
            </div>

            {selectedManualConfig.deposit_instructions && (
              <p className="whitespace-pre-wrap rounded-lg bg-dark-800/60 p-2.5 text-[11px] leading-relaxed text-gray-300 border border-dark-700/60">
                {selectedManualConfig.deposit_instructions}
              </p>
            )}

            {/* Manual Amount Input with Presets */}
            <div>
              <label className="deposit-amount-label block text-xs font-medium text-gray-400 mb-1">
                Enter Amount (₹)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-400 font-bold text-base">₹</span>
                </div>
                <input
                  type="number"
                  min={selectedManualConfig.minimum_deposit / 100}
                  max={selectedManualConfig.maximum_deposit / 100}
                  step="1"
                  value={manualAmount}
                  onChange={(event) => {
                    setManualAmount(event.target.value);
                    setManualError('');
                  }}
                  disabled={manualProcessing}
                  placeholder="e.g. 500"
                  className="deposit-amount-input bg-dark-800 border border-dark-700 text-white rounded-xl pl-8 pr-4 py-2.5 w-full focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-base font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              {/* Quick Presets for Manual */}
              <div className="deposit-presets-grid grid grid-cols-4 gap-2 mt-2">
                {[100, 500, 1000, 5000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setManualAmount(String(preset));
                      setManualError('');
                    }}
                    className="deposit-preset-btn py-1.5 px-2 bg-dark-800 hover:bg-purple-600/30 text-gray-200 hover:text-white border border-dark-700 hover:border-purple-500/50 rounded-lg text-xs font-bold transition-all active:scale-95 cursor-pointer"
                  >
                    +₹{preset}
                  </button>
                ))}
              </div>
            </div>

            {/* UTR / Transaction ID */}
            <div>
              <label className="deposit-amount-label block text-xs font-medium text-gray-400 mb-1">
                12-Digit UTR / Transaction ID <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={transactionId}
                onChange={(event) => {
                  setTransactionId(event.target.value);
                  setManualError('');
                }}
                disabled={manualProcessing}
                placeholder="Enter 12-digit UTR from payment app"
                maxLength={255}
                autoComplete="off"
                className="deposit-amount-input bg-dark-800 border border-dark-700 text-white rounded-xl px-3 py-2.5 w-full focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm font-mono font-bold"
              />
            </div>

            {/* Optional Note */}
            <div>
              <label className="deposit-amount-label block text-xs font-medium text-gray-400 mb-1">
                Note / Payment App (Optional)
              </label>
              <input
                type="text"
                value={manualRemarks}
                onChange={(event) => setManualRemarks(event.target.value)}
                disabled={manualProcessing}
                placeholder="e.g. Paid via PhonePe / GPay"
                maxLength={1000}
                className="bg-dark-800 border border-dark-700 text-white rounded-xl px-3 py-2 w-full focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-xs"
              />
            </div>

            {manualError && (
              <p className="rounded-lg border border-red-500/40 bg-red-900/30 p-2 text-center text-xs font-semibold text-red-200">
                {manualError}
              </p>
            )}

            {manualStatus && (
              <p className="rounded-lg border border-amber-500/40 bg-amber-900/20 p-2 text-center text-xs font-semibold text-amber-100">
                {manualStatus}
              </p>
            )}

            {manualDeposit && (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3 text-xs text-gray-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 size={14} /> Request Submitted
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    PENDING APPROVAL
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-400">Amount:</span>
                  <span className="font-bold text-white">₹{(manualDeposit.amount / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-400">UTR / Ref:</span>
                  <span className="font-mono text-amber-300 font-semibold">{manualDeposit.transaction_id || transactionId}</span>
                </div>
                <p className="text-[10px] text-gray-400 pt-1 border-t border-emerald-500/20">
                  Admin will verify your payment and credit your wallet.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={handleManualDepositSubmit}
              disabled={manualProcessing || !manualAmount || !transactionId.trim()}
              className="deposit-submit-btn w-full bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:from-dark-800 disabled:to-dark-800 disabled:text-gray-600 text-white font-extrabold py-3 px-4 rounded-xl shadow-lg shadow-purple-600/20 transition-all cursor-pointer text-sm active:scale-95"
            >
              {manualProcessing ? 'Submitting UTR...' : 'I have paid — Submit UTR ⚡'}
            </button>
            <p className="text-center text-[10.5px] text-gray-400">
              Wallet will be credited once verified by Admin.
            </p>
          </div>
        </Card>
      )}
      </div>
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