# 将 .bat 从 UTF-8/LF 转为 GBK/CRLF（中文 Windows 批处理标准编码）
$root = 'E:\study\zi\MyTime'
foreach ($name in @('start.bat', 'dev.bat', 'apk.bat')) {
  $p = Join-Path $root $name
  $t = [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8)
  $t = $t -replace "`n", "`r`n"
  [IO.File]::WriteAllText($p, $t, [Text.Encoding]::GetEncoding(936))
  Write-Host "converted: $name -> GBK+CRLF"
}
