import { useState } from 'react';
import { Card } from '../../components/common/Card';
import api from '../../services/api';

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

interface DepositResponse {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  provider: string;
  provider_order_id: string;
  currency: string;
  key_id: string;
  created_at: string;
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
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [processing, setProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState('');
  const [deposit, setDeposit] = useState<DepositResponse | null>(null);

  const minimumDeposit = 100;
  const maximumDeposit = 10000;

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
      // 1. Load Razorpay Checkout.
      const scriptLoaded =
        await loadRazorpayScript();

      if (!scriptLoaded) {
        throw new Error(
          'Unable to load Razorpay Checkout.',
        );
      }

      // 2. Create server-side deposit/order.
      const response = await api.post(
        '/deposits',
        {
          amount: amountInPaise,
          provider: 'razorpay',
        },
      );

      const depositData =
        response.data.data as DepositResponse;

      setDeposit(depositData);
      setPaymentStatus(
        'Opening secure Razorpay Checkout...',
      );

      // 3. Open Razorpay Checkout.
      const options: RazorpayOptions = {
        key: depositData.key_id,
        amount: depositData.amount,
        currency: depositData.currency,
        name: 'Gaming Platform',
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
            // 4. Server-side verification.
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
    } catch (error: any) {
      setErrorMsg(
        error.response?.data?.error?.message ||
          error.message ||
          'Failed to start payment.',
      );
      setPaymentStatus('');
      setProcessing(false);
    }
  };

  return (
    <div className="deposit-page w-full max-w-xl mx-auto space-y-4">
      <div className="deposit-page-header flex items-center justify-between">
        <h1 className="deposit-page-title text-xl sm:text-2xl font-extrabold text-white">
          Deposit Funds
        </h1>
        <span className="deposit-page-badge text-xs text-brand-400 bg-brand-500/10 border border-brand-500/20 px-2.5 py-1 rounded-full font-semibold">
          Instant Credit ⚡
        </span>
      </div>

      <Card title="Razorpay Secure Deposit" className="deposit-card">
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
            <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-3 text-red-300 text-xs">
              {errorMsg}
            </div>
          )}

          {paymentStatus && (
            <div className="bg-brand-900/20 border border-brand-500/30 rounded-xl p-3 text-brand-200 text-xs font-medium">
              {paymentStatus}
            </div>
          )}

          {deposit && (
            <div className="bg-dark-800 rounded-xl p-3 text-xs space-y-1.5 border border-dark-700">
              <div className="flex justify-between">
                <span className="text-gray-400">Order ID:</span>
                <span className="text-white font-mono">{deposit.id.slice(0, 12)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Amount:</span>
                <span className="text-gold-400 font-bold">₹{(deposit.amount / 100).toFixed(2)}</span>
              </div>
            </div>
          )}

          <button
            onClick={handleDepositSubmit}
            disabled={processing || !amount}
            className="deposit-submit-btn w-full bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:from-dark-800 disabled:to-dark-800 disabled:text-gray-600 text-white font-extrabold py-3 px-4 rounded-xl shadow-lg shadow-green-600/20 transition-all cursor-pointer text-sm active:scale-95"
          >
            {processing ? 'Processing...' : 'Pay Securely via Razorpay ⚡'}
          </button>
        </div>
      </Card>
    </div>
  );
}