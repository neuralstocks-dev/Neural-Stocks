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


class AgentScheduleReq(BaseModel):
    days: list[Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]] = Field(min_length=1)
    time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    timezone: str = "America/New_York"


class CreateAgentReq(BaseModel):
    agent_type: Literal["relative_strength_screener"] = "relative_strength_screener"
    schedule: AgentScheduleReq
    deliver_telegram: bool = True


class UpdateAgentReq(BaseModel):
    schedule: Optional[AgentScheduleReq] = None
    deliver_telegram: Optional[bool] = None
    enabled: Optional[bool] = None


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
