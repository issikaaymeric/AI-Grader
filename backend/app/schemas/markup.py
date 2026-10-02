from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class Segment(BaseModel):
    type: Literal["equal", "delete", "insert"]
    text: str


class MarkupParagraph(BaseModel):
    index: int
    kind: Literal["heading", "paragraph"] = "paragraph"
    page: int | None = None
    original: str
    corrected: str
    changed: bool = False
    category: str | None = None
    reason: str | None = None
    segments: list[Segment]


class MarkupResponse(BaseModel):
    assignment_id: str
    status: Literal["processing", "done", "error"]
    total_chunks: int
    done_chunks: int
    truncated: bool
    notice: str | None = None
    change_count: int
    paragraphs: list[MarkupParagraph]


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    paragraph_index: int | None = Field(default=None, ge=0)


class ChatMessage(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    created_at: str


class ChatReply(BaseModel):
    user_message: ChatMessage
    assistant_message: ChatMessage
