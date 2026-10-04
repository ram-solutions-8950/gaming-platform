"""RazorpayX Payouts API client for approved wallet withdrawals."""
from typing import Any
import httpx


class RazorpayXPayoutProvider:
    BASE_URL = "https://api.razorpay.com/v1"

    def __init__(self, key_id: str, key_secret: str, account_number: str) -> None:
        self.key_id = key_id
        self.key_secret = key_secret
        self.account_number = account_number

    def _request(self, method: str, path: str, **kwargs: Any) -> dict:
        try:
            response = httpx.request(
                method,
                f"{self.BASE_URL}{path}",
                auth=(self.key_id, self.key_secret),
                timeout=25.0,
                **kwargs,
            )
        except httpx.HTTPError as exc:
            raise ValueError("Could not reach RazorpayX. Check the payout credentials and try again.") from exc

        try:
            payload = response.json()
        except ValueError:
            payload = {}

        if not response.is_success:
            error = payload.get("error", {}) if isinstance(payload, dict) else {}
            message = error.get("description") or error.get("message") or "RazorpayX rejected the payout request."
            raise ValueError(str(message))
        if not isinstance(payload, dict):
            raise ValueError("RazorpayX returned an invalid response.")
        return payload

    def create_payout(self, withdrawal: Any, user: Any) -> dict:
        user_name = (getattr(user, "name", None) or getattr(user, "username", None) or "Player").strip()
        if len(user_name) < 3:
            user_name = f"Player {str(user.id)[:8]}"
        email = (getattr(user, "email", None) or "").strip()

        contact = self._request(
            "POST",
            "/contacts",
            json={
                "name": user_name[:50],
                "email": email or None,
                "type": "customer",
                "reference_id": str(user.id)[:40],
            },
        )
        contact_id = contact.get("id")
        if not contact_id:
            raise ValueError("RazorpayX did not return a beneficiary contact ID.")

        destination = (withdrawal.destination or "").strip()
        if withdrawal.method == "upi":
            fund_account_payload = {
                "contact_id": contact_id,
                "account_type": "vpa",
                "vpa": {"address": destination},
            }
            payout_mode = "UPI"
        else:
            parts = {}
            for part in destination.split(","):
                if ":" in part:
                    key, value = part.split(":", 1)
                    parts[key.strip().lower()] = value.strip()
            account_name = parts.get("name") or user_name
            account_number = parts.get("a/c") or parts.get("ac") or parts.get("account number")
            ifsc = (parts.get("ifsc") or "").upper()
            if not account_number or len(ifsc) != 11:
                raise ValueError("Withdrawal bank details are incomplete. Please re-submit the bank account and IFSC.")
            fund_account_payload = {
                "contact_id": contact_id,
                "account_type": "bank_account",
                "bank_account": {
                    "name": account_name[:120],
                    "ifsc": ifsc,
                    "account_number": account_number,
                },
            }
            payout_mode = "IMPS"

        fund_account = self._request("POST", "/fund_accounts", json=fund_account_payload)
        fund_account_id = fund_account.get("id")
        if not fund_account_id:
            raise ValueError("RazorpayX did not return a beneficiary fund account ID.")

        payout = self._request(
            "POST",
            "/payouts",
            headers={"X-Payout-Idempotency": str(withdrawal.id)},
            json={
                "account_number": self.account_number,
                "fund_account_id": fund_account_id,
                "amount": int(withdrawal.net_amount),
                "currency": "INR",
                "mode": payout_mode,
                "purpose": "payout",
                "queue_if_low_balance": True,
                "reference_id": str(withdrawal.id)[:40],
                "narration": "Wallet Withdrawal",
                "notes": {"withdrawal_id": str(withdrawal.id)},
            },
        )
        if not payout.get("id"):
            raise ValueError("RazorpayX did not return a payout ID.")
        return payout

    def get_payout(self, payout_id: str) -> dict:
        return self._request("GET", f"/payouts/{payout_id}")