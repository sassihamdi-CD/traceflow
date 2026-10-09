-- 014: invite key hygiene — revoke compromised pilot seed + bound invites.
-- Idempotent. Part of the per-company DB decision (2026-10-07).
--
-- 1. TF-133C98 (sha256 457a99ba…) was committed to git: delete it wherever found.
-- 2. Clamp any unlimited/non-expiring reviewer invites created before this
--    policy to max_uses=5 / 7-day expiry so a leaked code cannot be reused forever.
--    (Admins raise max_uses deliberately per company after this.)

-- Revoke the compromised committed seed (no-op when already gone).
DELETE FROM invites
WHERE code_hash = '457a99ba6245c9b730dfb536201ca55756537811285a3159f675157d3fd90538';

-- Bound pre-policy invites: unlimited -> 5 uses; never-expire -> 7 days.
UPDATE invites SET max_uses = 5 WHERE max_uses IS NULL;
UPDATE invites SET expires_at = now() + interval '7 days' WHERE expires_at IS NULL;
