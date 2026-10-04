import uuid
from unittest.mock import MagicMock, patch

from app.payment.providers.cashfree import CashfreeProvider


def _cashfree_response(order_id: str) -> MagicMock:
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {
        "order_id": order_id,
        "payment_session_id": f"session-{order_id}",
        "order_status": "ACTIVE",
    }
    return response


def test_cashfree_order_id_is_unique_for_each_deposit_attempt():
    provider = CashfreeProvider("app-id", "secret", is_sandbox=True)
    deposit_ids = [str(uuid.uuid4()), str(uuid.uuid4())]
    responses = [_cashfree_response(f"cf_{uuid.UUID(deposit_id).hex}") for deposit_id in deposit_ids]

    with patch("app.payment.providers.cashfree.httpx.Client") as client_factory:
        client_factory.return_value.__enter__.return_value.post.side_effect = responses
        results = [
            provider.create_payment(
                amount=10000,
                user_id="same-player",
                metadata={"deposit_id": deposit_id},
            )
            for deposit_id in deposit_ids
        ]

    order_ids = [result["provider_order_id"] for result in results]
    assert order_ids[0] != order_ids[1]
    assert all(len(order_id) <= 45 for order_id in order_ids)


def test_cashfree_order_id_is_stable_for_retries_of_same_deposit():
    provider = CashfreeProvider("app-id", "secret", is_sandbox=True)
    deposit_id = str(uuid.uuid4())
    expected_id = f"cf_{uuid.UUID(deposit_id).hex}"

    with patch("app.payment.providers.cashfree.httpx.Client") as client_factory:
        client_factory.return_value.__enter__.return_value.post.side_effect = [
            _cashfree_response(expected_id),
            _cashfree_response(expected_id),
        ]
        results = [
            provider.create_payment(
                amount=10000,
                user_id="same-player",
                metadata={"deposit_id": deposit_id},
            )
            for _ in range(2)
        ]

    assert results[0]["provider_order_id"] == expected_id
    assert results[1]["provider_order_id"] == expected_id
