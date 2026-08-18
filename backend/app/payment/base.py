"""
Abstract PaymentProvider interface.

Phase 3: Implement a concrete provider adapter (e.g. RazorpayProvider)
that inherits from PaymentProvider and implements every method below.

Architecture:
  Webhook Request
        ?
  payments router
        ?
  payment_service.get_provider(name)
        ?
  PaymentProvider.verify_webhook()
        ?
  PaymentProvider.process_webhook()
        ?
  wallet_service.credit_wallet()    <- Only when payment is verified
"""
from abc import ABC, abstractmethod
from typing import Any, Optional


class PaymentProvider(ABC):

    @abstractmethod
    def create_payment(self, amount: int, user_id: str, metadata: Optional[dict] = None) -> dict:
        """
        Initiate a payment order with the provider.
        Returns a dict with at least: provider_order_id, amount, currency.
        """
        ...

    @abstractmethod
    def get_payment_status(self, provider_order_id: str) -> dict:
        """
        Query payment status from the provider.
        Returns a dict with: status, provider_payment_id, amount.
        """
        ...

    @abstractmethod
    def verify_payment(self, provider_order_id: str, provider_payment_id: str, signature: str) -> bool:
        """
        Verify payment authenticity using provider signature.
        Returns True only if the signature is valid.
        """
        ...

    @abstractmethod
    def verify_webhook(self, raw_body: bytes, headers: dict) -> bool:
        """
        Verify webhook signature/authenticity.
        Must return False for any request with an invalid signature.
        NEVER credit wallet if this returns False.
        """
        ...

    @abstractmethod
    def process_webhook(self, raw_body: bytes, headers: dict) -> dict:
        """
        Parse a verified webhook payload.
        Returns a structured event dict.
        Must only be called AFTER verify_webhook() returns True.
        """
        ...

    @abstractmethod
    def reconcile(self, provider_order_id: str) -> dict:
        """
        Reconcile a payment record against provider records.
        Returns the provider's source-of-truth status.
        """
        ...
