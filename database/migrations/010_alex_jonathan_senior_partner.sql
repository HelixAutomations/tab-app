-- Migration: 2025 Rate Update for All Fee Earners
-- Date: 2025-12-30
-- Description: Update rates to new 2025 structure
-- Senior Partner £475, Partner £425, Associate Solicitor £350, Solicitor £310, Paralegal £210
-- Databases: helix-core-data, instructions (both have dbo.team table)

-- =============================================
-- 1. Promote Alex Cook & Jonathan Waters to Senior Partner (£475)
-- =============================================
UPDATE [dbo].[team] SET [Role] = 'Senior Partner', [Rate] = 475 WHERE [First] = 'Alex' AND [Last] = 'Cook';
UPDATE [dbo].[team] SET [Role] = 'Senior Partner', [Rate] = 475 WHERE [First] = 'Jonathan' AND [Last] = 'Waters';

-- =============================================
-- 2. Update remaining Partners (£425)
-- =============================================
UPDATE [dbo].[team] SET [Rate] = 425 WHERE [Role] = 'Partner';

-- =============================================
-- 3. Associate Solicitors (£350)
-- =============================================
UPDATE [dbo].[team] SET [Rate] = 350 WHERE [Role] = 'Associate Solicitor';

-- =============================================
-- 4. Solicitors (£310)
-- =============================================
UPDATE [dbo].[team] SET [Rate] = 310 WHERE [Role] = 'Solicitor';

-- =============================================
-- 5. Paralegals/Trainees (£210)
-- =============================================
UPDATE [dbo].[team] SET [Rate] = 210 WHERE [Role] IN ('Paralegal', 'paralegal', 'Trainee');

-- =============================================
-- VERIFY
-- =============================================
SELECT [Full Name], [Role], [Rate] FROM [dbo].[team] WHERE [Rate] > 0 ORDER BY [Rate] DESC;

-- =============================================
-- ROLLBACK (old rates)
-- =============================================
-- UPDATE [dbo].[team] SET [Role] = 'Partner', [Rate] = 395 WHERE [Role] = 'Senior Partner';
-- UPDATE [dbo].[team] SET [Rate] = 395 WHERE [Role] = 'Partner';
-- UPDATE [dbo].[team] SET [Rate] = 325 WHERE [Role] = 'Associate Solicitor';
-- UPDATE [dbo].[team] SET [Rate] = 285 WHERE [Role] = 'Solicitor' AND [Full Name] IN ('Bianca O''Donnell', 'Edward Lamptey');
-- UPDATE [dbo].[team] SET [Rate] = 195 WHERE [Role] = 'Solicitor' AND [Full Name] IN ('Joshua Whitcombe', 'Christopher Smith');
-- UPDATE [dbo].[team] SET [Rate] = 195 WHERE [Role] IN ('Paralegal', 'paralegal');
