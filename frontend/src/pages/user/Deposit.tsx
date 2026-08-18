import { useEffect, useState } from 'react';
import { Card } from '../../components/common/Card';
import { Loader } from '../../components/common/Loader';
import api from '../../services/api';

interface ActiveConfig {
  display_name: string;
  upi_id: string;
  qr_code_url: string | null;
  minimum_deposit: number;
  maximum_deposit: number;
  deposit_instructions: string | null;
}

export function DepositPage() {
  const [config, setConfig] = useState<ActiveConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [amountError, setAmountError] = useState<string>('');
  const [depositPending, setDepositPending] = useState(false);
  const [depositSuccess, setDepositSuccess] = useState(false);

  useEffect(() => {
    api.get('/payments/config/active')
      .then(r => setConfig(r.data.data))
      .catch(e => {
        if (e.response?.status === 404) {
          setErrorMsg('No active deposit method is currently available. Please try again later.');
        } else {
          setErrorMsg('Failed to load deposit information.');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader />;

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(e.target.value);
    setAmountError('');
  };

  const handleDepositSubmit = async () => {
    if (!config) return;
    
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setAmountError('Please enter a valid numeric amount greater than 0.');
      return;
    }
    
    const amountInPaise = Math.round(numAmount * 100);
    
    if (amountInPaise < config.minimum_deposit) {
      setAmountError(`Minimum deposit is ₹${(config.minimum_deposit / 100).toFixed(2)}`);
      return;
    }
    
    if (amountInPaise > config.maximum_deposit) {
      setAmountError(`Maximum deposit is ₹${(config.maximum_deposit / 100).toFixed(2)}`);
      return;
    }

    setDepositPending(true);
    setAmountError('');
    
    try {
      await api.post('/deposits', {
        amount: amountInPaise,
        provider: 'upi'
      });
      setDepositSuccess(true);
    } catch (e: any) {
      setAmountError(e.response?.data?.error?.message || 'Failed to submit deposit.');
    } finally {
      setDepositPending(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-extrabold text-white text-center">Deposit Funds</h1>
      
      {errorMsg ? (
        <Card>
          <div className="text-center py-8 text-gray-400">
            <svg className="mx-auto h-12 w-12 text-gray-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>{errorMsg}</p>
          </div>
        </Card>
      ) : config ? (
        <div className="space-y-6">
          <Card title="Step 1: Enter Deposit Amount">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Amount</label>
                <div className="relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-500 sm:text-lg">₹</span>
                  </div>
                  <input
                    type="number"
                    value={amount}
                    onChange={handleAmountChange}
                    className="bg-gray-800 border border-gray-700 text-white rounded-md pl-8 py-3 w-full focus:ring-indigo-500 focus:border-indigo-500 text-lg"
                    placeholder="Enter amount"
                    disabled={depositSuccess || depositPending}
                  />
                </div>
                <div className="mt-2 text-xs text-gray-500 flex justify-between">
                  <span>Minimum: ₹{(config.minimum_deposit / 100).toFixed(2)}</span>
                  <span>Maximum: ₹{(config.maximum_deposit / 100).toFixed(2)}</span>
                </div>
                {amountError && (
                  <p className="mt-2 text-sm text-red-500">{amountError}</p>
                )}
              </div>
              
              {!depositSuccess && (
                <button
                  onClick={handleDepositSubmit}
                  disabled={depositPending || !amount}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold py-3 px-4 rounded transition-colors"
                >
                  {depositPending ? 'Processing...' : 'Confirm Amount'}
                </button>
              )}
            </div>
          </Card>

          {depositSuccess && (
            <>
              <Card title="Step 2: Scan & Pay">
                <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-700 rounded-xl bg-gray-800/50">
                  {config.qr_code_url ? (
                    <div className="bg-white p-2 rounded-lg shadow-lg mb-6">
                      <img src={`http://localhost:8000${config.qr_code_url}`} alt="Payment QR Code" className="w-64 h-64 object-contain" />
                    </div>
                  ) : (
                    <div className="w-64 h-64 bg-gray-800 rounded-lg flex items-center justify-center mb-6">
                      <span className="text-gray-500 text-sm">No QR Code available</span>
                    </div>
                  )}
                  
                  <div className="text-center w-full">
                    <p className="text-sm text-gray-400 mb-2">UPI ID</p>
                    <div className="flex items-center justify-center space-x-2">
                      <p className="text-xl font-bold text-white font-mono bg-gray-900 px-4 py-2 rounded border border-gray-700">
                        {config.upi_id}
                      </p>
                      <button 
                        onClick={() => { navigator.clipboard.writeText(config.upi_id); alert('UPI ID copied!'); }}
                        className="p-2 bg-gray-700 hover:bg-gray-600 rounded text-white transition-colors"
                        title="Copy UPI ID"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </Card>

              <Card title="Step 3: Payment Instructions">
                <div className="bg-indigo-900/20 border border-indigo-500/20 rounded p-5 text-indigo-200">
                  <p className="whitespace-pre-wrap text-sm mb-4">
                    {config.deposit_instructions || "Please transfer the amount to the UPI ID provided."}
                  </p>
                  <div className="bg-yellow-900/30 border border-yellow-700/50 rounded p-3 text-yellow-300 text-sm">
                    <span className="font-bold flex items-center mb-1">
                      <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Important Note:
                    </span>
                    Your payment verification will happen after the payment is successfully received. Please do not refresh this page immediately after payment. The admin team or automated system will process your pending request.
                  </div>
                </div>
              </Card>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
