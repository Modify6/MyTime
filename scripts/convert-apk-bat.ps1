# Convert apk.bat from UTF-8 to GBK/CRLF (normalize newlines first to avoid CRCR-LF)
$root = 'E:\study\zi\MyTime'
$p = Join-Path $root 'apk.bat'
$t = [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8)
$t = $t -replace "`r`n", "`n"
$t = $t -replace "`n", "`r`n"
[IO.File]::WriteAllText($p, $t, [Text.Encoding]::GetEncoding(936))
Write-Host 'converted: apk.bat -> GBK+CRLF'
