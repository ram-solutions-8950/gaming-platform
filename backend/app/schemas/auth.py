from typing import Optional
from pydantic import BaseModel, EmailStr


class RegisterIn(BaseModel):
    name: str
    username: str
    email: EmailStr
    password: str
    referral_code: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class LogoutIn(BaseModel):
    refresh_token: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
