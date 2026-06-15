-- =============================================================================
-- Post-schema setup migration
-- Requirement 8.1  : TimescaleDB hypertable on analytics_snapshots.period_start
-- Requirement 13.4 : RLS policy preventing UPDATE/DELETE on events table
-- Requirements 5.1 : Default SLA rules seed data for all 7 journey stages
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Convert analytics_snapshots to a TimescaleDB hypertable
--    Must run AFTER the table is created by the Drizzle-generated migration.
--    IF NOT EXISTS guard makes this idempotent.
-- -----------------------------------------------------------------------------
SELECT create_hypertable(
  'analytics_snapshots',
  'period_start',
  if_not_exists => TRUE,
  migrate_data   => TRUE
);

-- -----------------------------------------------------------------------------
-- 2. Row-Level Security on events — prevent UPDATE and DELETE at DB level
--    Requirement 13.4 & 3.6: Events are immutable; no mutation via any path.
-- -----------------------------------------------------------------------------
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Allow all roles to SELECT and INSERT (application layer handles auth)
CREATE POLICY events_select_policy
  ON events
  FOR SELECT
  USING (true);

CREATE POLICY events_insert_policy
  ON events
  FOR INSERT
  WITH CHECK (true);

-- Explicitly deny UPDATE — any attempt returns permission denied
CREATE POLICY events_no_update_policy
  ON events
  FOR UPDATE
  USING (false);

-- Explicitly deny DELETE — any attempt returns permission denied
CREATE POLICY events_no_delete_policy
  ON events
  FOR DELETE
  USING (false);

-- -----------------------------------------------------------------------------
-- 3. Seed default SLA rules for the 7 active journey stages
--    Thresholds are conservative industry-standard values; Admins can tune them
--    via PUT /sla/rules/{stage}.
--    ON CONFLICT DO NOTHING makes this idempotent.
-- -----------------------------------------------------------------------------
INSERT INTO sla_rules (id, journey_stage, threshold_hours, description, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'Inquiry',              24.00, 'Initial customer inquiry must be acknowledged within 24 hours',           NOW(), NOW()),
  (gen_random_uuid(), 'Sales Review',         48.00, 'Sales team review and qualification within 48 hours',                     NOW(), NOW()),
  (gen_random_uuid(), 'Engineering Design',   72.00, 'Engineering assessment and design scoping within 72 hours',               NOW(), NOW()),
  (gen_random_uuid(), 'Quotation',            48.00, 'Quotation preparation and delivery to customer within 48 hours',          NOW(), NOW()),
  (gen_random_uuid(), 'Approval',             24.00, 'Internal approval of quotation and work order within 24 hours',           NOW(), NOW()),
  (gen_random_uuid(), 'Dispatch',             48.00, 'Equipment and team dispatch coordination within 48 hours',                NOW(), NOW()),
  (gen_random_uuid(), 'Delivery',             96.00, 'On-site delivery and installation completion within 96 hours',            NOW(), NOW())
ON CONFLICT (journey_stage) DO NOTHING;
