from sqlalchemy import Column, ForeignKey, Integer, String, TIMESTAMP, Table, Text
from sqlmodel import SQLModel


# Minimal descriptors for querying the SDK-managed session tables and resolving
# app-owned foreign keys. The SDK creates the physical tables before app schema
# initialization; these descriptors never create or alter the SDK schema.
metadata = SQLModel.metadata

agent_sessions = Table(
    "agent_sessions",
    metadata,
    Column("session_id", String, primary_key=True),
    Column("created_at", TIMESTAMP(timezone=False), nullable=False),
    Column("updated_at", TIMESTAMP(timezone=False), nullable=False),
    extend_existing=True,
)

agent_messages = Table(
    "agent_messages",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("session_id", String, ForeignKey("agent_sessions.session_id", ondelete="CASCADE"), nullable=False),
    Column("message_data", Text, nullable=False),
    Column("created_at", TIMESTAMP(timezone=False), nullable=False),
    extend_existing=True,
)
