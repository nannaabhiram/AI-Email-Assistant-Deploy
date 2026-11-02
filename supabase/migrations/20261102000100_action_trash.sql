-- Bulk "Move to trash" action (recoverable for 30 days in Gmail). Never a hard delete.
alter type public.action_type add value if not exists 'trash';
