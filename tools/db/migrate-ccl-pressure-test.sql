-- Migration: Add Pressure Test columns to CclContent
-- These columns persist the Safety Net / Pressure Test result alongside the CCL draft,
-- so the PT ceremony doesn't replay every time the modal opens.

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'CclContent' AND COLUMN_NAME = 'PressureTestJson'
)
BEGIN
  ALTER TABLE CclContent ADD PressureTestJson NVARCHAR(MAX) NULL;
  ALTER TABLE CclContent ADD PressureTestAt DATETIME2 NULL;
  ALTER TABLE CclContent ADD PressureTestFlaggedCount INT NULL;
  ALTER TABLE CclContent ADD PressureTestDataSources NVARCHAR(500) NULL;
  ALTER TABLE CclContent ADD PressureTestDurationMs INT NULL;
  ALTER TABLE CclContent ADD PressureTestTrackingId NVARCHAR(50) NULL;
END;
