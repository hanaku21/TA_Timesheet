-- =====================================================================
--  008_announcements.sql
--  ประกาศ/ข่าวสารที่แสดงเป็น slideshow (modal) ตอน TA เปิดหน้าแรก
--  kind = 'text' (title + body) | 'image' (image_data = data URL, resized client-side)
--  Admin manages these in แท็บ "นำเข้า/ลบ/สำรองข้อมูล". Safe to re-run.
-- =====================================================================

CREATE TABLE IF NOT EXISTS announcements (
  id          SERIAL PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('text','image')),
  title       TEXT,
  body        TEXT,
  image_data  TEXT,           -- data:image/...;base64,... (≤ ~1.5 MB)
  link_url    TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(active, sort_order);
