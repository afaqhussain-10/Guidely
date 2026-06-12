"""add_viewport_dimensions_to_steps

Revision ID: 055fdbd032c8
Revises: 03b6f8c3c6ab
Create Date: 2026-06-05 17:18:55.208773

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '055fdbd032c8'
down_revision: Union[str, Sequence[str], None] = '03b6f8c3c6ab'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add viewport_width and viewport_height columns to steps table
    op.add_column('steps', sa.Column('viewport_width', sa.Float(), nullable=True, comment='Viewport width at the time of capturing this step'))
    op.add_column('steps', sa.Column('viewport_height', sa.Float(), nullable=True, comment='Viewport height at the time of capturing this step'))


def downgrade() -> None:
    """Downgrade schema."""
    # Remove viewport columns
    op.drop_column('steps', 'viewport_height')
    op.drop_column('steps', 'viewport_width')
