-- Query to find all enquiries with prospects@ email
SELECT TOP 50 
    ID, 
    Email, 
    [First Name], 
    [Last Name], 
    [Touchpoint Date], 
    [Area of Work], 
    [Estimated Value],
    [Phone Number]
FROM enquiries 
WHERE Email LIKE '%prospects@%' 
ORDER BY [Touchpoint Date] DESC;

-- Count total prospects@ emails
SELECT COUNT(*) as TotalProspectsEmails
FROM enquiries 
WHERE Email LIKE '%prospects@%';

-- Check for specific IDs we saw
SELECT 
    ID, 
    Email, 
    [First Name], 
    [Last Name], 
    [Touchpoint Date], 
    [Area of Work]
FROM enquiries 
WHERE ID IN ('28609', '23849', '26069')
ORDER BY [Touchpoint Date] DESC;