SELECT TOP 20 
    id, 
    first, 
    last, 
    email, 
    phone, 
    datetime, 
    aow 
FROM enquiries 
WHERE email = 'prospects@helix-law.com' 
AND id = 28609 
ORDER BY datetime DESC
