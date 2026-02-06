-- LV Takeoff Intelligence Database Schema
-- Run with: wrangler d1 execute lv-takeoff-db --file=./schema.sql

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  job_number TEXT UNIQUE NOT NULL,
  project_name TEXT NOT NULL,
  client_name TEXT,
  address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'active'
);

-- Project data (BOM, device counts, settings)
CREATE TABLE IF NOT EXISTS project_data (
  project_id TEXT PRIMARY KEY,
  device_counts TEXT,
  bom_data TEXT,
  settings TEXT,
  floor_plans TEXT,
  issues TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Progress tracking per material item
CREATE TABLE IF NOT EXISTS progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  material_id TEXT NOT NULL,
  installed INTEGER DEFAULT 0,
  labor_used REAL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, material_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Daily log entries
CREATE TABLE IF NOT EXISTS daily_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  module_id TEXT,
  item TEXT,
  unit TEXT,
  qty_installed INTEGER,
  hours_used REAL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_projects_job_number ON projects(job_number);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_progress_project ON progress(project_id);
CREATE INDEX IF NOT EXISTS idx_logs_project ON daily_logs(project_id);
