from enum import StrEnum

from pydantic import BaseModel, Field


class ToolResultStatusSchema(StrEnum):
    SUCCESS = "success"
    ERROR = "error"


class ToolResultTypeSchema(StrEnum):
    SKILL_DETAIL = "skill_detail"
    KNOWLEDGE_DETAIL = "knowledge_detail"
    KNOWLEDGE_MUTATION = "knowledge_mutation"
    WORK_PROJECT = "work_project"
    REPORT = "report"


class ToolResultSchema(BaseModel):
    status: ToolResultStatusSchema
    type: ToolResultTypeSchema
    output: str = ""


class ReportToolResultOutputSchema(BaseModel):
    report_id: str = Field(min_length=1)
    filename: str
    size: int = Field(ge=0)
    chars: int = Field(ge=0)
