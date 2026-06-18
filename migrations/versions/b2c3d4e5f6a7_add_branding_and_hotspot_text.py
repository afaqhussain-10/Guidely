"""add_branding_fields_to_demos_and_hotspot_text_to_steps

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-16 18:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Demo-level branding / player presentation
    op.add_column('demos', sa.Column('accent_color', sa.String(), nullable=True, comment='Primary accent color used for hotspots, tooltips and progress'))
    op.add_column('demos', sa.Column('theme', sa.String(), nullable=True, comment="Player theme: 'light' or 'dark'"))
    op.add_column('demos', sa.Column('author_name', sa.String(), nullable=True, comment='Display name of the demo author, shown beneath the player'))
    op.add_column('demos', sa.Column('cta_text', sa.String(), nullable=True, comment='Call-to-action button label shown in the player'))
    op.add_column('demos', sa.Column('cta_url', sa.String(), nullable=True, comment='Call-to-action button destination URL'))
    op.add_column('demos', sa.Column('cta_color', sa.String(), nullable=True, comment='Call-to-action button background color'))

    # Step-level hotspot microcopy
    op.add_column('steps', sa.Column('hotspot_text', sa.Text(), nullable=True, comment='Short hotspot tooltip text shown in the player (Supademo-style)'))


def downgrade() -> None:
    op.drop_column('steps', 'hotspot_text')
    op.drop_column('demos', 'cta_color')
    op.drop_column('demos', 'cta_url')
    op.drop_column('demos', 'cta_text')
    op.drop_column('demos', 'author_name')
    op.drop_column('demos', 'theme')
    op.drop_column('demos', 'accent_color')
