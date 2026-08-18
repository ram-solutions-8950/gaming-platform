from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session
from uuid import UUID
from typing import Optional
from ..dependencies.database import get_db
from ..schemas.user import UserOut, AdminUserStatusUpdateIn
from ..schemas.deposit import DepositOut
from ..schemas.withdrawal import WithdrawalOut
from ..schemas.wallet import WalletTransactionOut
from ..schemas.payment import PaymentConfigOut, PaymentConfigUpdateIn, PaymentConfigCreateIn
from ..models.user import User, UserRole, UserStatus
from ..models.deposit import Deposit
from ..models.withdrawal import Withdrawal
from ..models.transaction import WalletTransaction
from ..models.payment import PaymentConfiguration
from ..services import wallet_service, audit_service
from ..models.transaction import WalletTransactionType
from ..security.permissions import require_admin, require_super_admin
from ..utils.responses import success_response, error_response
from ..middleware.rate_limiter import limiter

router = APIRouter(prefix="/admin", tags=["Admin"])


# -- Users ----------------------------------------------------------------------
@router.get("/users")
@limiter.limit("30/minute")
def list_users(
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: Optional[str] = Query(default=None),
    role: Optional[str] = Query(default=None),
):
    query = db.query(User)
    if status:
        query = query.filter(User.status == status)
    if role:
        query = query.filter(User.role == role)
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return success_response({
        "total": total, "page": page, "page_size": page_size,
        "items": [UserOut.model_validate(u).model_dump() for u in items],
    })


@router.get("/users/{user_id}")
def get_user(user_id: UUID, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return error_response("NOT_FOUND", "User not found", status_code=404)
    return success_response(UserOut.model_validate(user).model_dump())


@router.patch("/users/{user_id}/status")
def update_user_status(
    user_id: UUID,
    data: AdminUserStatusUpdateIn,
    admin: User = Depends(require_super_admin),   # Only SUPER_ADMIN can change user status
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return error_response("NOT_FOUND", "User not found", status_code=404)
    old_status = user.status
    user.status = data.status
    audit_service.log_action(
        db, action="USER_STATUS_CHANGE", actor_id=admin.id,
        entity_type="user", entity_id=user_id,
        metadata={"old": old_status.value, "new": data.status.value, "reason": data.reason},
    )
    db.commit()
    return success_response(UserOut.model_validate(user).model_dump())


# -- Transactions ---------------------------------------------------------------
@router.get("/transactions")
def list_all_transactions(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    total = db.query(WalletTransaction).count()
    items = db.query(WalletTransaction).order_by(WalletTransaction.created_at.desc()).offset((page-1)*page_size).limit(page_size).all()
    return success_response({
        "total": total, "page": page, "page_size": page_size,
        "items": [WalletTransactionOut.model_validate(t).model_dump() for t in items],
    })


# -- Deposits -------------------------------------------------------------------
@router.get("/deposits")
def list_all_deposits(admin: User = Depends(require_admin), db: Session = Depends(get_db), page: int = 1, page_size: int = 20):
    total = db.query(Deposit).count()
    items = db.query(Deposit).order_by(Deposit.created_at.desc()).offset((page-1)*page_size).limit(page_size).all()
    return success_response({
        "total": total, "page": page, "page_size": page_size,
        "items": [DepositOut.model_validate(d).model_dump() for d in items],
    })


# -- Withdrawals ----------------------------------------------------------------
@router.get("/withdrawals")
def list_all_withdrawals(admin: User = Depends(require_admin), db: Session = Depends(get_db), page: int = 1, page_size: int = 20):
    total = db.query(Withdrawal).count()
    items = db.query(Withdrawal).order_by(Withdrawal.created_at.desc()).offset((page-1)*page_size).limit(page_size).all()
    return success_response({
        "total": total, "page": page, "page_size": page_size,
        "items": [WithdrawalOut.model_validate(w).model_dump() for w in items],
    })


# -- Payment Settings -----------------------------------------------------------
@router.get("/payment-settings")
@limiter.limit("30/minute")
def get_payment_settings(request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    configs = db.query(PaymentConfiguration).all()
    return success_response([PaymentConfigOut.model_validate(c).model_dump() for c in configs])


@router.post("/payment-settings")
@limiter.limit("10/minute")
def create_payment_settings(
    request: Request,
    data: PaymentConfigCreateIn,
    admin: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    # Check for duplicate provider
    existing = db.query(PaymentConfiguration).filter(PaymentConfiguration.provider == data.provider).first()
    if existing:
        return error_response("DUPLICATE_PROVIDER", f"Provider '{data.provider}' already exists", status_code=409)
    config = PaymentConfiguration(
        provider=data.provider,
        display_name=data.display_name,
        upi_id=data.upi_id,
        qr_code_reference=data.qr_code_reference,
        minimum_deposit=data.minimum_deposit,
        maximum_deposit=data.maximum_deposit,
        deposit_instructions=data.deposit_instructions,
        enabled=data.enabled,
    )
    db.add(config)
    db.flush()
    audit_service.log_action(
        db, action="PAYMENT_CONFIG_CREATE", actor_id=admin.id,
        entity_type="payment_configuration", entity_id=str(config.id),
        metadata={"provider": data.provider, "display_name": data.display_name, "enabled": data.enabled},
    )
    db.commit()
    db.refresh(config)
    return success_response(PaymentConfigOut.model_validate(config).model_dump(), status_code=201)


@router.patch("/payment-settings/{config_id}")
def update_payment_settings(
    config_id: UUID,
    data: PaymentConfigUpdateIn,
    admin: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    config = db.query(PaymentConfiguration).filter(PaymentConfiguration.id == config_id).first()
    if not config:
        return error_response("NOT_FOUND", "Configuration not found", status_code=404)

    update_data = data.model_dump(exclude_none=True)

    # Validate: if enabling, UPI ID must be present (either in update or existing)
    final_enabled = update_data.get("enabled", config.enabled)
    final_upi = update_data.get("upi_id", config.upi_id)
    if final_enabled and not final_upi:
        return error_response("VALIDATION_ERROR", "UPI ID is required when configuration is enabled")

    # Validate: min/max consistency
    final_min = update_data.get("minimum_deposit", config.minimum_deposit)
    final_max = update_data.get("maximum_deposit", config.maximum_deposit)
    if final_max < final_min:
        return error_response("VALIDATION_ERROR", "Maximum deposit must be >= minimum deposit")

    for field, value in update_data.items():
        setattr(config, field, value)

    audit_service.log_action(db, action="PAYMENT_CONFIG_CHANGE", actor_id=admin.id,
                             entity_type="payment_configuration", entity_id=str(config_id),
                             metadata=update_data)
    db.commit()
    db.refresh(config)
    return success_response(PaymentConfigOut.model_validate(config).model_dump())


@router.delete("/payment-settings/{config_id}")
def delete_payment_settings(
    config_id: UUID,
    admin: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    config = db.query(PaymentConfiguration).filter(PaymentConfiguration.id == config_id).first()
    if not config:
        return error_response("NOT_FOUND", "Configuration not found", status_code=404)

    config_provider = config.provider
    config_was_enabled = config.enabled

    db.delete(config)
    audit_service.log_action(
        db, action="PAYMENT_CONFIG_DELETE", actor_id=admin.id,
        entity_type="payment_configuration", entity_id=str(config_id),
        metadata={"provider": config_provider, "was_enabled": config_was_enabled},
    )
    db.commit()

    result = {"deleted": True, "provider": config_provider}
    if config_was_enabled:
        result["warning"] = "The deleted configuration was enabled. There is now no active payment method."
    return success_response(result)


@router.post("/payment-settings/{config_id}/qr-upload")
@limiter.limit("10/minute")
async def upload_qr_code(
    request: Request,
    config_id: UUID,
    admin: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    import os
    import secrets
    from pathlib import Path
    from fastapi import UploadFile, File

    config = db.query(PaymentConfiguration).filter(PaymentConfiguration.id == config_id).first()
    if not config:
        return error_response("NOT_FOUND", "Configuration not found", status_code=404)

    # Parse multipart manually since we need the Depends for auth
    form = await request.form()
    file = form.get("file")
    if file is None or not hasattr(file, "filename"):
        return error_response("MISSING_FILE", "No file uploaded", status_code=400)

    # Validate MIME type
    ALLOWED_MIME = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
    content_type = getattr(file, "content_type", "") or ""
    if content_type not in ALLOWED_MIME:
        return error_response("INVALID_FILE_TYPE", f"Only PNG, JPEG, WebP images are allowed. Got: {content_type}", status_code=400)

    # Validate extension
    original_name = getattr(file, "filename", "") or "unknown"
    ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp"}
    ext = Path(original_name).suffix.lower()
    if ext not in ALLOWED_EXT:
        return error_response("INVALID_FILE_EXT", f"File extension not allowed: {ext}", status_code=400)

    # Read file content
    content = await file.read()

    # Validate size (max 2MB)
    MAX_SIZE = 2 * 1024 * 1024
    if len(content) > MAX_SIZE:
        return error_response("FILE_TOO_LARGE", f"QR image must be under 2MB. Got: {len(content)} bytes", status_code=400)

    if len(content) == 0:
        return error_response("EMPTY_FILE", "Uploaded file is empty", status_code=400)

    # Validate image header magic bytes
    PNG_MAGIC = b'\x89PNG\r\n\x1a\n'
    JPEG_MAGIC = b'\xff\xd8\xff'
    WEBP_MAGIC = b'RIFF'
    if not (content[:8] == PNG_MAGIC or content[:3] == JPEG_MAGIC or content[:4] == WEBP_MAGIC):
        return error_response("INVALID_IMAGE", "File content does not match a valid image format", status_code=400)

    # ---------------------------------------------------------
    # NEW: Validate that the image actually contains a QR code
    # ---------------------------------------------------------
    try:
        import cv2
        import numpy as np
        
        # Decode the image from memory
        nparr = np.frombuffer(content, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return error_response("INVALID_IMAGE", "Could not decode image data", status_code=400)
            
        # Initialize the QRCode detector
        detector = cv2.QRCodeDetector()
        
        # Detect and decode the QR code
        data, bbox, straight_qrcode = detector.detectAndDecode(img)
        
        if not bbox is not None or not data:
            return error_response("NO_QR_CODE", "Uploaded image does not contain a readable QR code.", status_code=400)
            
    except ImportError:
        # Fallback if cv2 isn't installed (though we added it to requirements)
        print("WARNING: cv2 not installed, skipping QR validation")
        pass
    except Exception as e:
        return error_response("QR_VALIDATION_ERROR", f"Error validating QR code: {str(e)}", status_code=400)

    # Generate safe filename — no user-controlled path components
    safe_name = f"qr_{secrets.token_hex(16)}{ext}"
    upload_dir = Path(__file__).resolve().parents[2] / "uploads" / "qr"
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / safe_name

    # Prevent path traversal (belt-and-suspenders)
    if not str(dest.resolve()).startswith(str(upload_dir.resolve())):
        return error_response("SECURITY_ERROR", "Invalid file path", status_code=400)

    with open(dest, "wb") as f:
        f.write(content)

    # Delete old QR file if it exists
    old_ref = config.qr_code_reference
    if old_ref:
        old_name = old_ref.split("/")[-1]
        old_path = upload_dir / old_name
        if old_path.exists() and str(old_path.resolve()).startswith(str(upload_dir.resolve())):
            try:
                old_path.unlink()
            except OSError:
                pass

    # Store only the relative URL path, not filesystem path
    qr_url = f"/uploads/qr/{safe_name}"
    config.qr_code_reference = qr_url
    audit_service.log_action(
        db, action="PAYMENT_QR_UPLOAD", actor_id=admin.id,
        entity_type="payment_configuration", entity_id=str(config_id),
        metadata={"qr_url": qr_url, "original_filename": original_name, "size_bytes": len(content)},
    )
    db.commit()
    db.refresh(config)
    return success_response({"qr_code_reference": qr_url})


# -- Wallet Adjustments ---------------------------------------------------------
@router.post("/wallet-adjustments")
def wallet_adjustment(
    user_id: UUID,
    amount: int,
    reason: str,
    admin: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    if not reason or len(reason.strip()) < 5:
        return error_response("INVALID_REASON", "Reason must be at least 5 characters")
    try:
        if amount >= 0:
            tx = wallet_service.credit_wallet(
                db, user_id, abs(amount), WalletTransactionType.ADJUSTMENT,
                reference_type="admin_adjustment", reference_id=f"adj_{admin.id}_{user_id}_{amount}",
                metadata={"reason": reason, "admin_id": str(admin.id)},
            )
        else:
            tx = wallet_service.debit_wallet(
                db, user_id, abs(amount), WalletTransactionType.ADJUSTMENT,
                reference_type="admin_adjustment", reference_id=f"adj_{admin.id}_{user_id}_{amount}",
                metadata={"reason": reason, "admin_id": str(admin.id)},
            )
        audit_service.log_action(
            db, action="WALLET_ADJUSTMENT", actor_id=admin.id,
            entity_type="wallet", entity_id=user_id,
            metadata={"amount": amount, "reason": reason, "tx_id": str(tx.id)},
        )
        db.commit()
        return success_response(WalletTransactionOut.model_validate(tx).model_dump())
    except ValueError as e:
        return error_response("ADJUSTMENT_ERROR", str(e))

