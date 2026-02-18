-- Drop CclFeedback table (superseded by CclAssessment)
-- Run against Instructions DB via Azure Query Editor

IF OBJECT_ID(N'CclFeedback', N'U') IS NOT NULL
BEGIN
    DROP TABLE CclFeedback;
    PRINT 'Dropped CclFeedback table';
END
ELSE
BEGIN
    PRINT 'CclFeedback table does not exist — nothing to drop';
END
