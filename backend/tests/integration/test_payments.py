import io
import pytest
import qrcode
from app.models.payment import PaymentConfiguration
from app.models.user import User, UserRole, UserStatus
from app.security.jwt import create_access_token

def generate_qr_bytes(data: str) -> bytes:
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    bio = io.BytesIO()
    img.save(bio, format="PNG")
    return bio.getvalue()

@pytest.fixture
def test_qr_bytes():
    return generate_qr_bytes("test@upi")

import uuid

@pytest.fixture
def superadmin_token(db):
    username = f"sa_test_{uuid.uuid4().hex[:6]}"
    user = User(
        name="Super Admin",
        username=username,
        email=f"{username}@test.com",
        password_hash="hash",
        role=UserRole.SUPER_ADMIN,
        status=UserStatus.ACTIVE
    )
    db.add(user)
    db.commit()
    return create_access_token(str(user.id), user.role.value)

@pytest.fixture
def user_token(db):
    username = f"user_test_{uuid.uuid4().hex[:6]}"
    user = User(
        name="User",
        username=username,
        email=f"{username}@test.com",
        password_hash="hash",
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    db.add(user)
    db.commit()
    # create wallet for user so deposits can work
    from app.models.wallet import Wallet
    w = Wallet(user_id=user.id, balance=0)
    db.add(w)
    db.commit()
    return create_access_token(str(user.id), user.role.value)

def test_admin_create_payment_settings(client, superadmin_token):
    res = client.post("/api/v1/admin/payment-settings", json={
        "provider": "test_provider",
        "display_name": "Test UPI",
        "minimum_deposit": 10000,
        "maximum_deposit": 50000,
        "deposit_instructions": "Send money here"
    }, headers={"Authorization": f"Bearer {superadmin_token}"})
    assert res.status_code == 201

def test_admin_upload_qr_valid(client, superadmin_token, test_qr_bytes, db):
    config = db.query(PaymentConfiguration).first()
    res = client.post(f"/api/v1/admin/payment-settings/{config.id}/qr-upload",
                      files={"file": ("test.png", test_qr_bytes, "image/png")},
                      headers={"Authorization": f"Bearer {superadmin_token}"})
    assert res.status_code == 200

def test_admin_upload_qr_invalid_non_qr(client, superadmin_token, db):
    config = db.query(PaymentConfiguration).first()
    # A 1x1 black pixel PNG (not a QR code)
    non_qr = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\x0d\n\x01\x85\x00\x00\x00\x00IEND\xaeB`\x82'
    res = client.post(f"/api/v1/admin/payment-settings/{config.id}/qr-upload",
                      files={"file": ("test.png", non_qr, "image/png")},
                      headers={"Authorization": f"Bearer {superadmin_token}"})
    assert res.status_code == 400

def test_admin_upload_qr_invalid_file(client, superadmin_token, db):
    config = db.query(PaymentConfiguration).first()
    non_img = b'hello world text'
    res = client.post(f"/api/v1/admin/payment-settings/{config.id}/qr-upload",
                      files={"file": ("test.txt", non_img, "text/plain")},
                      headers={"Authorization": f"Bearer {superadmin_token}"})
    assert res.status_code == 400

def test_admin_upload_qr_too_large(client, superadmin_token, test_qr_bytes, db):
    config = db.query(PaymentConfiguration).first()
    large_img = test_qr_bytes + b'0' * (2 * 1024 * 1024)
    res = client.post(f"/api/v1/admin/payment-settings/{config.id}/qr-upload",
                      files={"file": ("test.png", large_img, "image/png")},
                      headers={"Authorization": f"Bearer {superadmin_token}"})
    assert res.status_code == 400

def test_admin_upload_qr_path_traversal(client, superadmin_token, test_qr_bytes, db):
    config = db.query(PaymentConfiguration).first()
    res = client.post(f"/api/v1/admin/payment-settings/{config.id}/qr-upload",
                      files={"file": ("../../../test.png", test_qr_bytes, "image/png")},
                      headers={"Authorization": f"Bearer {superadmin_token}"})
    assert res.status_code == 200
    qr_ref = res.json()["data"]["qr_code_reference"]
    assert ".." not in qr_ref
    assert qr_ref.startswith("/uploads/qr/")

def test_user_active_config(client, user_token, db):
    config = db.query(PaymentConfiguration).first()
    config.enabled = True
    config.upi_id = "test@upi"
    db.commit()
    
    res = client.get("/api/v1/payments/config/active", headers={"Authorization": f"Bearer {user_token}"})
    assert res.status_code == 200
    data = res.json()["data"]
    assert "id" not in data
    assert "webhook" not in str(data)

def test_auth_roles(client, user_token, superadmin_token):
    # Admin rejected from mutating
    res = client.post("/api/v1/admin/payment-settings", json={
        "provider": "admin_provider",
        "display_name": "Test UPI",
        "minimum_deposit": 10000,
        "maximum_deposit": 50000,
    }, headers={"Authorization": f"Bearer {user_token}"}) # USER trying
    assert res.status_code == 403

def test_deposit_api_validation(client, user_token, superadmin_token, db):
    # Set up config limits
    db.query(PaymentConfiguration).delete()
    config = PaymentConfiguration(
        provider="test_provider",
        display_name="Test UPI",
        enabled=True,
        minimum_deposit=10000,
        maximum_deposit=50000,
        deposit_instructions="Send money here"
    )
    db.add(config)
    db.commit()
    
    # 1. Valid amount (200 INR)
    res = client.post("/api/v1/deposits", json={"amount": 20000, "provider": "test_provider"},
                      headers={"Authorization": f"Bearer {user_token}"})
    assert res.status_code == 201
    
    # 2. Below minimum (50 INR)
    res = client.post("/api/v1/deposits", json={"amount": 5000, "provider": "test_provider"},
                      headers={"Authorization": f"Bearer {user_token}"})
    assert res.status_code == 400
    assert "below the minimum deposit" in res.json()["error"]["message"].lower()
    
    # 3. Above maximum (600 INR)
    res = client.post("/api/v1/deposits", json={"amount": 60000, "provider": "test_provider"},
                      headers={"Authorization": f"Bearer {user_token}"})
    assert res.status_code == 400
    assert "exceeds the maximum deposit" in res.json()["error"]["message"].lower()
    
    # 4. Zero or negative
    res = client.post("/api/v1/deposits", json={"amount": 0, "provider": "test_provider"},
                      headers={"Authorization": f"Bearer {user_token}"})
    assert res.status_code == 400
    assert "strictly positive" in res.json()["error"]["message"].lower()

