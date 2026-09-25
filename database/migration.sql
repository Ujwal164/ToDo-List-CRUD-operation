-- Run once against the existing database. Every ALTER is safe to rerun.
ALTER TABLE items ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE items ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium';
ALTER TABLE items ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE items ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'Personal';
ALTER TABLE items ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

UPDATE items SET status = 'pending' WHERE status IS NULL;
UPDATE items SET priority = 'medium' WHERE priority IS NULL;
UPDATE items SET category = 'Personal' WHERE category IS NULL;

ALTER TABLE items ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE items ALTER COLUMN status SET NOT NULL;
ALTER TABLE items ALTER COLUMN priority SET DEFAULT 'medium';
ALTER TABLE items ALTER COLUMN category SET DEFAULT 'Personal';
ALTER TABLE items ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;