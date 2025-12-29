-- Migration: Add escalation tracking to rate_change_notifications
-- Database: instructions
-- Date: 2025-12-29
-- Purpose: Persist escalation emails sent for rate change notices

ALTER TABLE rate_change_notifications
ADD
    escalated_at DATETIME2 NULL,
    escalated_by NVARCHAR(100) NULL;
