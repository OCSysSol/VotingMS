import uuid

from pydantic import BaseModel


class BuildingOut(BaseModel):
    id: uuid.UUID
    name: str
    oc_plan_number: str | None = None

    model_config = {"from_attributes": True}
