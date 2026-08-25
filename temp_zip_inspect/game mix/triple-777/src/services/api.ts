import { apiFetch } from "./auth";

export interface Wallet {
  virtual_chips: number;
  real_paise: number;
  bonus_paise: number;
}

export interface Triple777Config {
  min_bet: number;
  max_bet: number;
  symbols: string[];
  paytable: Record<string, number>;
}

export interface SpinResponse {
  round_id: string;
  round_code: string;
  reels: string[];
  won: boolean;
  symbol: string | null;
  multiplier: number;
  payout: number;
  tier: "jackpot" | "win" | "loss";
  balance: number;
  server_seed: string;
  server_seed_hash: string;
  jackpot_won: number;
  jackpot_amount: number;
}

export interface HistoryItem {
  round_code: string;
  mode: string;
  stake: number;
  reels: string[];
  won: boolean;
  status: "WON" | "LOST";
  multiplier: number;
  payout: number;
  jackpot_payout: number;
  balance_before: number;
  balance_after: number;
  created_at: string;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function unwrap<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError((body && (body.detail as string)) || `request failed (${res.status})`, res.status);
  }
  return body as T;
}

export async function getWallet(serverUrl: string): Promise<Wallet | null> {
  const res = await apiFetch(serverUrl, "/api/v1/wallet");
  if (!res.ok) return null;
  return (await res.json()) as Wallet;
}

export async function getConfig(serverUrl: string): Promise<Triple777Config> {
  const res = await apiFetch(serverUrl, "/api/v1/triple-777/config");
  return unwrap<Triple777Config>(res);
}

export async function getJackpot(serverUrl: string): Promise<number | null> {
  const res = await apiFetch(serverUrl, "/api/v1/triple-777/jackpot");
  if (!res.ok) return null;
  const body = await res.json();
  return typeof body.amount === "number" ? body.amount : null;
}

// Practice-mode-only free chip refill — freely repeatable (no lifetime
// cap), amount must be one of DEMO_TOPUP_AMOUNTS. Never touches the
// real-money wallet. There is no automatic welcome grant: a new player's
// balance starts at 0 until this is called explicitly.
export const DEMO_TOPUP_AMOUNTS = [100, 500, 1000, 5000] as const;

export async function demoTopup(serverUrl: string, amount: number): Promise<number | null> {
  const res = await apiFetch(serverUrl, "/api/v1/triple-777/demo-topup", {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
  if (!res.ok) return null;
  const body = await res.json();
  return typeof body.balance === "number" ? body.balance : null;
}

export async function spin(
  serverUrl: string,
  body: { stake: number; clientSeed: string; nonce: number; mode?: "virtual" | "real" },
): Promise<SpinResponse> {
  const res = await apiFetch(serverUrl, "/api/v1/triple-777/spin", {
    method: "POST",
    body: JSON.stringify({
      stake: body.stake, client_seed: body.clientSeed, nonce: body.nonce, mode: body.mode ?? "virtual",
    }),
  });
  return unwrap<SpinResponse>(res);
}

export async function getHistory(serverUrl: string): Promise<HistoryItem[]> {
  const res = await apiFetch(serverUrl, "/api/v1/triple-777/history");
  if (!res.ok) return [];
  return (await res.json()) as HistoryItem[];
}

export interface DepositOrder {
  deposit_id: string;
  razorpay_order_id: string;
  razorpay_key_id: string;
  amount_paise: number;
  currency: string;
}

export async function createDepositOrder(serverUrl: string, amountPaise: number): Promise<DepositOrder> {
  const res = await apiFetch(serverUrl, "/api/v1/payments/deposit", {
    method: "POST",
    body: JSON.stringify({ amount_paise: amountPaise }),
  });
  return unwrap<DepositOrder>(res);
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export async function pingServer(serverUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${serverUrl.replace(/\/$/, "")}/api/v1/health`);
    return res.ok;
  } catch {
    return false;
  }
}
