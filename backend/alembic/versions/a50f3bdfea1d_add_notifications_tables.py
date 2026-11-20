"""add notifications tables

Revision ID: a50f3bdfea1d
Revises: 8c41d7e2a5f3
Create Date: 2026-11-20 16:41:50.776099

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a50f3bdfea1d'
down_revision: Union[str, Sequence[str], None] = '8c41d7e2a5f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Creates only the three notification tables. Autogenerate also
    # proposed altering users.avatar_url and users.permissions; that is
    # pre-existing drift between the models and the live schema, unrelated
    # to notifications, so it is deliberately not included here.
    op.create_table('notifications',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('title', sa.String(length=140), nullable=False),
    sa.Column('message', sa.Text(), nullable=False),
    sa.Column('category', sa.Enum('GENERAL', 'PROMO', 'MAINTENANCE', 'ALERT', name='notification_category'), nullable=False),
    sa.Column('audience', sa.Enum('ALL', 'SELECTED', name='notification_audience'), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_by', sa.UUID(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_notifications_audience'), 'notifications', ['audience'], unique=False)
    op.create_index(op.f('ix_notifications_created_at'), 'notifications', ['created_at'], unique=False)
    op.create_index(op.f('ix_notifications_is_active'), 'notifications', ['is_active'], unique=False)
    op.create_table('notification_reads',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('notification_id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('read_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['notification_id'], ['notifications.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('notification_id', 'user_id', name='uq_notification_read')
    )
    op.create_index(op.f('ix_notification_reads_notification_id'), 'notification_reads', ['notification_id'], unique=False)
    op.create_index('ix_notification_reads_user', 'notification_reads', ['user_id'], unique=False)
    op.create_table('notification_recipients',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('notification_id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['notification_id'], ['notifications.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('notification_id', 'user_id', name='uq_notification_recipient')
    )
    op.create_index(op.f('ix_notification_recipients_notification_id'), 'notification_recipients', ['notification_id'], unique=False)
    op.create_index('ix_notification_recipients_user', 'notification_recipients', ['user_id'], unique=False)
    # ### end Alembic commands ###


def downgrade() -> None:
    # Creates only the three notification tables. Autogenerate also
    # proposed altering users.avatar_url and users.permissions; that is
    # pre-existing drift between the models and the live schema, unrelated
    # to notifications, so it is deliberately not included here.
    op.drop_index('ix_notification_recipients_user', table_name='notification_recipients')
    op.drop_index(op.f('ix_notification_recipients_notification_id'), table_name='notification_recipients')
    op.drop_table('notification_recipients')
    op.drop_index('ix_notification_reads_user', table_name='notification_reads')
    op.drop_index(op.f('ix_notification_reads_notification_id'), table_name='notification_reads')
    op.drop_table('notification_reads')
    op.drop_index(op.f('ix_notifications_is_active'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_created_at'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_audience'), table_name='notifications')
    op.drop_table('notifications')
    # Postgres keeps an enum type after the table using it is dropped, and
    # SQLAlchemy only emits CREATE TYPE, never DROP TYPE. Without these the
    # downgrade leaves the two types behind and a later re-upgrade fails with
    # "type notification_category already exists".
    sa.Enum(name='notification_category').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='notification_audience').drop(op.get_bind(), checkfirst=True)
    # ### end Alembic commands ###

