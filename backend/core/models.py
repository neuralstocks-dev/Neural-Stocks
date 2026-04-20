"""Pydantic request/response models for the Neural API."""
from typing import Optional, Literal
from pydantic import BaseModel, EmailStr, Field


class SignupReq(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str = Field(min_length=1, max_length=80)


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class AuthResp(BaseModel):
    token: str
    user: dict


class GoogleSessionReq(BaseModel):
    session_id: str


class UpgradeReq(BaseModel):
    plan: Literal["free", "pro", "elite"]


class AddStockReq(BaseModel):
    ticker: str = Field(min_length=1, max_length=15)
    category: Optional[str] = "other"


class UnlockReq(BaseModel):
    duration: Literal[
        "1h", "2h", "4h", "12h", "1d", "3d", "1w", "2w", "3w", "4w", "forever"
    ]


class Quote(BaseModel):
    ticker: str
    name: Optional[str] = None
    price: Optional[float] = None
    previous_close: Optional[float] = None
    change: Optional[float] = None
    change_pct: Optional[float] = None
    currency: Optional[str] = None
    market_state: Optional[str] = None
    volume: Optional[int] = None
    day_high: Optional[float] = None
    day_low: Optional[float] = None
    exchange: Optional[str] = None
