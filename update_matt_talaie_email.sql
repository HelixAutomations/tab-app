-- Update Matt Talaie's email from prospects@helix-law.com to Mat.Talaie@hotmail.com
-- IMPORTANT: Run the search query first to confirm the correct record ID before executing this update

-- First verify the record exists:
SELECT ID, Email, First_Name, Last_Name, Company, Phone_Number
FROM [dbo].[enquiries] 
WHERE Email = 'prospects@helix-law.com' 
  AND (First_Name LIKE '%Matt%' OR First_Name LIKE '%Mat%')
  AND Last_Name LIKE '%Talaie%';

-- If the above query returns the correct record, uncomment and run the update below:
-- Replace [RECORD_ID] with the actual ID from the search result

/*
UPDATE [dbo].[enquiries] 
SET Email = 'Mat.Talaie@hotmail.com'
WHERE ID = [RECORD_ID]
  AND Email = 'prospects@helix-law.com'
  AND (First_Name LIKE '%Matt%' OR First_Name LIKE '%Mat%')
  AND Last_Name LIKE '%Talaie%';

-- Verify the update was successful:
SELECT ID, Email, First_Name, Last_Name, Company, Phone_Number, Date_Created
FROM [dbo].[enquiries] 
WHERE ID = [RECORD_ID];
*/