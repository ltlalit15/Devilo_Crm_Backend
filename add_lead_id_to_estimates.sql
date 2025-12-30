ALTER TABLE estimates ADD COLUMN lead_id INT UNSIGNED NULL AFTER project_id;
ALTER TABLE estimates ADD INDEX idx_estimate_lead (lead_id);
ALTER TABLE estimates ADD CONSTRAINT fk_estimate_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
