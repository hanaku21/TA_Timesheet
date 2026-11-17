-- =====================================================================
--  009_user_billing_fields.sql
--  Billing details for TOR (จ้างเหมา) documents: ใบวางบิล / ใบเสร็จรับเงิน.
--  Filled by admin (แท็บผู้ใช้) or imported from the ผู้ช่วยสอน CSV
--  (ที่อยู่ตามบัตรประชาชน, เลขที่บัตรประชาชน). Safe to re-run.
-- =====================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_card TEXT;
