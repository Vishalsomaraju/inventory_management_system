import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from psycopg2 import IntegrityError

from app.config.database import get_db_connection
from app.middleware.auth import create_access_token, get_current_user


router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str


@router.post("/login")
def login(payload: LoginRequest, conn=Depends(get_db_connection)):
    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT id, name, email, password_hash, role
            FROM users
            WHERE email = %s
            """,
            (payload.email,),
        )
        row = cursor.fetchone()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    user_id, name, email, password_hash, role = row
    if not bcrypt.checkpw(payload.password.encode("utf-8"), password_hash.encode("utf-8")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    user = {"id": user_id, "name": name, "email": email, "role": role}
    access_token = create_access_token({"sub": str(user_id)})

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user,
    }


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, conn=Depends(get_db_connection)):
    password_hash = bcrypt.hashpw(payload.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO users (name, email, password_hash, role)
                VALUES (%s, %s, %s, %s)
                RETURNING id, name, email, role, created_at
                """,
                (payload.name, payload.email, password_hash, payload.role),
            )
            row = cursor.fetchone()
        conn.commit()
    except IntegrityError:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists",
        )
    except Exception:
        conn.rollback()
        raise

    user_id, name, email, role, created_at = row
    return {
        "id": user_id,
        "name": name,
        "email": email,
        "role": role,
        "created_at": created_at,
    }


@router.get("/me")
def get_me(current_user=Depends(get_current_user)):
    return current_user
