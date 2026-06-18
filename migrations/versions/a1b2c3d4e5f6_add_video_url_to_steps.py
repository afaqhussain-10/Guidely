"""add_video_url_to_steps

Revision ID: a1b2c3d4e5f6
Revises: 055fdbd032c8
Create Date: 2026-06-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '055fdbd032c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'steps',
        sa.Column(
            'video_url',
            sa.String(),
            nullable=True,
            comment='URL to the lead-up video clip for this step',
        ),
    )


def downgrade() -> None:
    op.drop_column('steps', 'video_url')
