-- Migration: Add half-day columns to annualLeave table
-- Date: 2025-12-31
-- Description: Adds half_day_start and half_day_end columns to support half-day leave requests

-- Add half_day_start column (BIT, defaults to 0/false)
IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('[dbo].[annualLeave]') 
    AND name = 'half_day_start'
)
BEGIN
    ALTER TABLE [dbo].[annualLeave]
    ADD [half_day_start] BIT NOT NULL DEFAULT 0;
    PRINT 'Added half_day_start column to annualLeave table';
END
ELSE
BEGIN
    PRINT 'half_day_start column already exists';
END
GO

-- Add half_day_end column (BIT, defaults to 0/false)
IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('[dbo].[annualLeave]') 
    AND name = 'half_day_end'
)
BEGIN
    ALTER TABLE [dbo].[annualLeave]
    ADD [half_day_end] BIT NOT NULL DEFAULT 0;
    PRINT 'Added half_day_end column to annualLeave table';
END
ELSE
BEGIN
    PRINT 'half_day_end column already exists';
END
GO

-- Verify the columns exist
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'annualLeave'
AND COLUMN_NAME IN ('half_day_start', 'half_day_end');
