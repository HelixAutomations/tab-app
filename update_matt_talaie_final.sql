-- Update Matt Talaie's email from prospects@helix-law.com to Mat.Talaie@hotmail.com
-- Record ID: 28609

-- First verify the current record:
SELECT ID, Email, First_Name, Last_Name, Point_of_Contact, Company, Phone_Number, Date_Created
FROM enquiries 
WHERE id = '28609'
AND Email = 'prospects@helix-law.com';

-- Update the email:
UPDATE enquiries
SET Email = 'Mat.Talaie@hotmail.com'
WHERE id = '28609'
AND Email = 'prospects@helix-law.com';

-- Verify the update was successful:
SELECT ID, Email, First_Name, Last_Name, Point_of_Contact, Company, Phone_Number, Date_Created
FROM enquiries 
WHERE id = '28609';