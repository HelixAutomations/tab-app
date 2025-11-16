-- Add TeamsMessageId column to store raw Teams message timestamp as BIGINT
-- This preserves exact millisecond precision that gets lost with datetime2 conversion

USE instructions;

-- Check if column already exists
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'TeamsBotActivityTracking' 
    AND COLUMN_NAME = 'TeamsMessageId'
)
BEGIN
    ALTER TABLE TeamsBotActivityTracking
    ADD TeamsMessageId BIGINT;
    
    PRINT 'Added TeamsMessageId column as BIGINT';
END
ELSE
BEGIN
    PRINT 'TeamsMessageId column already exists';
END

-- Update existing records to populate TeamsMessageId from MessageTimestamp
UPDATE TeamsBotActivityTracking 
SET TeamsMessageId = DATEDIFF_BIG(MILLISECOND, '1970-01-01', MessageTimestamp)
WHERE TeamsMessageId IS NULL AND MessageTimestamp IS NOT NULL;

PRINT 'Updated existing records with TeamsMessageId values';