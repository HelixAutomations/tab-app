$lz = Invoke-RestMethod "http://localhost:8080/api/access/effective?initials=LZ&email=lz@helix-law.com"
Write-Output "LZ activity-tab=$($lz.capabilities.'feature:activity-tab')"
$kw = Invoke-RestMethod "http://localhost:8080/api/access/effective?initials=KW&email=kw@helix-law.com"
Write-Output "KW activity-tab=$($kw.capabilities.'feature:activity-tab')"
$body = @{ subject="user:KW"; capability="feature:activity-tab"; effect="allow"; reason="Phase D test" } | ConvertTo-Json
$grant = Invoke-RestMethod -Method Post "http://localhost:8080/api/access/grants?initials=LZ&email=lz@helix-law.com" -ContentType "application/json" -Body $body
Write-Output "granted id=$($grant.grantId)"
Start-Sleep -Seconds 1
$kw2 = Invoke-RestMethod "http://localhost:8080/api/access/effective?initials=KW&email=kw@helix-law.com"
Write-Output "KW after grant activity-tab=$($kw2.capabilities.'feature:activity-tab')"
Invoke-RestMethod -Method Delete "http://localhost:8080/api/access/grants/$($grant.grantId)?initials=LZ&email=lz@helix-law.com" | Out-Null
Start-Sleep -Seconds 1
$kw3 = Invoke-RestMethod "http://localhost:8080/api/access/effective?initials=KW&email=kw@helix-law.com"
Write-Output "KW after revoke activity-tab=$($kw3.capabilities.'feature:activity-tab')"
