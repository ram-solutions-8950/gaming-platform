"""Helpers for the free-text search boxes on the admin portal."""

from typing import Optional
from uuid import UUID

# Characters an admin can only have picked up by copying a value out of a table
# cell or a chat message — none of them ever appear inside an ID, a name or an
# email address.
_WRAPPERS = " \t\r\n\"'`<>(),;"


def normalize_search_term(raw: Optional[str]) -> Optional[str]:
    """Clean a search term typed or pasted into an admin search box.

    IDs are shortened to ``cf40682f...`` in the tables, so an admin who retypes
    what they see sends the trailing ellipsis along with it. Strip that (and any
    quotes or stray punctuation picked up on the way) instead of answering with an
    empty result set. Returns ``None`` when nothing searchable is left.
    """
    if raw is None:
        return None
    term = raw.strip().strip(_WRAPPERS)
    term = term.replace("…", "")  # single-character ellipsis
    term = term.rstrip(".").strip()
    return term or None


def as_uuid(term: Optional[str]) -> Optional[UUID]:
    """Return ``term`` as a UUID when it is a complete one, else ``None``."""
    if not term:
        return None
    try:
        return UUID(term)
    except (ValueError, AttributeError, TypeError):
        return None
