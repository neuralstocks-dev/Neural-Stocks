"""KidStocks JWT auth — strict isolation from adult Neural auth.

Architecture lock (decision recorded in PRD):
* Kid users live in a SEPARATE `kids_users` collection — NEVER share the
  `users` collection so admin queries, billing, and email targeting can
  never accidentally include kids.
* Kid JWTs carry `aud: "stockkids"` claim; `get_current_kid` REQUIRES it.
  Even if a kid token leaked into adult API space, the adult dependency
  looks up `sub` in `users` and 401s because the id doesn't exist there.
  Even if an adult token were used against kid endpoints, this dependency
  rejects it (no aud or wrong aud → 401). Defence in depth.
* Reuses bcrypt + the same JWT_SECRET as adult so we don't need to
  manage two key materials. The audience claim is the security boundary.
"""
from __future__ import annotations

from datetime import timedelta
from typing import Optional

import jwt as pyjwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from core.config import JWT_ALG, JWT_EXPIRE_HOURS, JWT_SECRET
from core.db import db
from core.security import now_utc

JWT_AUD_KIDS = "stockkids"

security = HTTPBearer(auto_error=False)


def create_kid_jwt(student_id: str) -> str:
    """Mint a JWT scoped strictly to KidStocks endpoints."""
    payload = {
        "sub": student_id,
        "aud": JWT_AUD_KIDS,
        "iat": now_utc(),
        "exp": now_utc() + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_kid(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    """Resolve the KidStocks student bound to the bearer token.

    Order of guards (fail-closed):
      1. Bearer token present → else 401
      2. Decodes with the shared JWT secret → else 401
      3. Audience claim equals `stockkids` → else 401 (rejects adult tokens)
      4. `sub` resolves to a row in `kids_users` → else 401
    """
    if not creds or not creds.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = pyjwt.decode(
            creds.credentials,
            JWT_SECRET,
            algorithms=[JWT_ALG],
            audience=JWT_AUD_KIDS,
        )
    except pyjwt.MissingRequiredClaimError:
        # Adult tokens have no aud — reject cleanly.
        raise HTTPException(status_code=401, detail="Token not valid for KidStocks")
    except pyjwt.InvalidAudienceError:
        raise HTTPException(status_code=401, detail="Token not valid for KidStocks")
    except pyjwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    student_id = payload.get("sub")
    student = await db.kids_users.find_one(
        {"id": student_id}, {"_id": 0, "password_hash": 0}
    )
    if not student:
        raise HTTPException(status_code=401, detail="Student not found")
    return student
