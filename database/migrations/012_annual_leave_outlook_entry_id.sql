IF COL_LENGTH('dbo.annualLeave', 'OutlookEntryId') IS NULL
BEGIN
  ALTER TABLE [dbo].[annualLeave]
    ADD [OutlookEntryId] NVARCHAR(100) NULL;
END;
