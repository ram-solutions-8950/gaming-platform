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
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-extrabold text-white text-center">
        Deposit Funds
      </h1>

      <Card title="Razorpay Deposit">
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Amount
            </label>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-500 text-lg">
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
                className="bg-gray-800 border border-gray-700 text-white rounded-md pl-8 py-3 w-full focus:ring-indigo-500 focus:border-indigo-500 text-lg"
                placeholder="Enter amount"
              />
            </div>

            <div className="mt-2 text-xs text-gray-500 flex justify-between">
              <span>
                Minimum: ₹100.00
              </span>

              <span>
                Maximum: ₹10,000.00
              </span>
            </div>

            {amountError && (
              <p className="mt-2 text-sm text-red-500">
                {amountError}
              </p>
            )}
          </div>

          {errorMsg && (
            <div className="bg-red-900/20 border border-red-500/30 rounded p-4 text-red-300 text-sm">
              {errorMsg}
            </div>
          )}

          {paymentStatus && (
            <div className="bg-indigo-900/20 border border-indigo-500/30 rounded p-4 text-indigo-200 text-sm">
              {paymentStatus}
            </div>
          )}

          {deposit && (
            <div className="bg-gray-800 rounded p-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">
                  Deposit
                </span>
                <span className="text-white font-mono">
                  {deposit.id}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-400">
                  Amount
                </span>
                <span className="text-white">
                  ₹{(deposit.amount / 100).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-400">
                  Status
                </span>
                <span className="text-white">
                  {deposit.status}
                </span>
              </div>
            </div>
          )}

          <button
            onClick={handleDepositSubmit}
            disabled={
              processing || !amount
            }
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold py-3 px-4 rounded transition-colors"
          >
            {processing
              ? 'Processing...'
              : 'Pay with Razorpay'}
          </button>
        </div>
      </Card>
    </div>
  );
}