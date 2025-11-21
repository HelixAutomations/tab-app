-- Search for Matt Talaie record with prospects@helix-law.com email
SELECT ID, Email, First_Name, Last_Name, Company, Phone_Number, Date_Created, Area_of_Work
FROM [dbo].[enquiries] 
WHERE Email = 'prospects@helix-law.com' 
  AND (First_Name LIKE '%Matt%' OR First_Name LIKE '%Mat%')
  AND Last_Name LIKE '%Talaie%';