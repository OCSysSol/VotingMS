import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class VoteChoice(str, enum.Enum):
    yes = "yes"
    no = "no"
    abstained = "abstained"
    not_eligible = "not_eligible"
    selected = "selected"
    against = "against"


class VoteStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"


class Vote(Base):
    __tablename__ = "votes"
    __table_args__ = (
        Index(
            "uq_votes_non_multi_choice",
            "general_meeting_id",
            "motion_id",
            "lot_owner_id",
            unique=True,
            postgresql_where=text("motion_option_id IS NULL"),  # nosemgrep: raw-sql-requires-comment -- partial index WHERE predicate
        ),
        Index(
            "uq_votes_multi_choice",
            "general_meeting_id",
            "motion_id",
            "lot_owner_id",
            "motion_option_id",
            unique=True,
            postgresql_where=text("motion_option_id IS NOT NULL"),  # nosemgrep: raw-sql-requires-comment -- partial index WHERE predicate
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    general_meeting_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("general_meetings.id", ondelete="CASCADE"),
        nullable=False,
    )
    motion_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("motions.id", ondelete="CASCADE"),
        nullable=False,
    )
    voter_email: Mapped[str] = mapped_column(String, nullable=False)
    # Column intentionally kept as lot_owner_id (audit snapshot); FK target updated to lots.id
    lot_owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lots.id", ondelete="CASCADE"),
        nullable=False,
    )
    choice: Mapped[VoteChoice | None] = mapped_column(
        Enum(VoteChoice, name="votechoice"),
        nullable=True,
    )
    status: Mapped[VoteStatus] = mapped_column(
        Enum(VoteStatus, name="votestatus"),
        nullable=False,
        default=VoteStatus.draft,
        server_default=VoteStatus.draft.value,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    motion_option_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("motion_options.id", ondelete="RESTRICT"),
        nullable=True,
    )

    # Relationships
    general_meeting: Mapped["GeneralMeeting"] = relationship(  # noqa: F821
        "GeneralMeeting", back_populates="votes"
    )
    motion: Mapped["Motion"] = relationship(  # noqa: F821
        "Motion", back_populates="votes"
    )
    motion_option: Mapped["MotionOption | None"] = relationship(  # noqa: F821
        "MotionOption",
    )
