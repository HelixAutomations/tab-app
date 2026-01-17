IF COL_LENGTH('dbo.annualLeave', 'requested_at') IS NULL
BEGIN
  ALTER TABLE [dbo].[annualLeave]
    ADD [requested_at] DATETIME2 NULL
      CONSTRAINT DF_annualLeave_requested_at DEFAULT (SYSUTCDATETIME());
END

IF COL_LENGTH('dbo.annualLeave', 'approved_at') IS NULL
BEGIN
  ALTER TABLE [dbo].[annualLeave]
    ADD [approved_at] DATETIME2 NULL;
END

IF COL_LENGTH('dbo.annualLeave', 'booked_at') IS NULL
BEGIN
  ALTER TABLE [dbo].[annualLeave]
    ADD [booked_at] DATETIME2 NULL;
END

IF COL_LENGTH('dbo.annualLeave', 'updated_at') IS NULL
BEGIN
  ALTER TABLE [dbo].[annualLeave]
    ADD [updated_at] DATETIME2 NULL
      CONSTRAINT DF_annualLeave_updated_at DEFAULT (SYSUTCDATETIME());
END
