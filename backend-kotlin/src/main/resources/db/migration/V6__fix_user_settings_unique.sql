-- V6: Fix contradictory UNIQUE constraints on user_settings.
-- Previously both UNIQUE(setting_key) and UNIQUE(user_id, setting_key) existed,
-- which incorrectly prevented two different users from sharing the same setting_key.
-- Only UNIQUE(user_id, setting_key) makes semantic sense for a per-user KV store.

DO $$
DECLARE
    dup_count INT;
BEGIN
    SELECT COUNT(*) INTO dup_count
    FROM (
        SELECT setting_key
        FROM user_settings
        GROUP BY setting_key
        HAVING COUNT(*) > 1
    ) d;
    IF dup_count > 0 THEN
        RAISE EXCEPTION 'Cannot drop unique_setting_key: % duplicate setting_key values exist', dup_count;
    END IF;
END $$;

-- Drop the global uniqueness constraint on setting_key alone.
-- Keeps UNIQUE(user_id, setting_key) intact.
ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS unique_setting_key;
