from app.database import SessionLocal
from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.security.password import hash_password

db = SessionLocal()
email = "paymenttest@example.com"
pwd = "TestPay@2026!"
user = db.query(User).filter(User.email == email).first()

if not user:
    user = User(
        name="Payment Test User",
        username="paymenttest",
        email=email,
        password_hash=hash_password(pwd),
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    wallet = Wallet(user_id=user.id, balance=100000)  # 1000 INR
    db.add(wallet)
    db.commit()
    print("Created user:", user.email, "balance:", wallet.balance)
else:
    user.password_hash = hash_password(pwd)
    user.status = UserStatus.ACTIVE
    wallet = db.query(Wallet).filter(Wallet.user_id == user.id).first()
    if not wallet:
        wallet = Wallet(user_id=user.id, balance=100000)
        db.add(wallet)
    elif wallet.balance < 10000:
        wallet.balance = 100000
    db.commit()
    print("Updated user:", user.email, "balance:", wallet.balance)
db.close()
