# Lấy danh sách máy bán (máy new + máy 99%) từ trang https://khanghuyapple.lovable.app => zalo-bot\kho-may.json
# Trang lovable là nguồn giá duy nhất. Không lấy được thì giữ kho-may.json cũ.
# Chạy: powershell -ExecutionPolicy Bypass -File zalo-bot\kho-may.ps1
$base = 'https://khanghuyapple.lovable.app'
$utf8 = New-Object Text.UTF8Encoding $false

function Get-Text($url) {
  $tmp = [IO.Path]::GetTempFileName()
  & curl.exe -sL $url -o $tmp
  $s = [IO.File]::ReadAllText($tmp, $utf8)
  Remove-Item $tmp
  return $s
}
function Clean($s) { ("$s".Normalize([Text.NormalizationForm]::FormKC) -replace '\s+', ' ').Trim() }

$page = Get-Text "$base/"
$updated = if ($page -match 'Máy có sẵn cập nhật\s*(\d{1,2}/\d{1,2}/\d{4})') { $Matches[1] } else { Get-Date -Format 'dd/MM/yyyy' }

# Danh sách máy nằm trong 1 file JS của trang (tên file đổi mỗi lần trang cập nhật) => dò từng file
$re = '\{id:`([^`]*)`,name:`([^`]*)`,price:`([^`]*)`,condition:`([^`]*)`,category:`([^`]*)`,family:`([^`]*)`,section:`([^`]*)`,color:`([^`]*)`,capacity:`([^`]*)`,battery:`([^`]*)`,part:`([^`]*)`,origin:`([^`]*)`,note:`([^`]*)`\}'
$rows = $null
$assets = [regex]::Matches($page, '/assets/[A-Za-z0-9._-]+\.js') | ForEach-Object Value | Select-Object -Unique
foreach ($a in $assets) {
  $js = Get-Text "$base$a"
  if ($js -notmatch 'category:`used`') { continue }
  $rows = [regex]::Matches($js, $re)
  if ($rows.Count) { break }
}
if (-not $rows -or -not $rows.Count) { Write-Host 'Khong doc duoc danh sach may tren trang (giu kho-may.json cu)'; exit 0 }

$items = New-Object System.Collections.Generic.List[object]
foreach ($r in $rows) {
  $g = $r.Groups
  $name = Clean $g[2].Value
  $priceText = Clean $g[3].Value
  if ($priceText -match 'HẾT') { continue }
  $digits = $priceText -replace '[^\d]', ''
  $price = if ($digits) { [long]$digits } else { 0 } # 0 = liên hệ
  $fam = $g[6].Value; $hint = "$name $(Clean $g[7].Value)".ToUpper()
  $cat = if ($fam -eq 'iPhone') { 'iphone' } elseif ($fam -eq 'iPad') { 'ipad' }
         elseif ($hint -match 'SAMSUNG|SAM SUNG|GALAXY|\bSS\b') { 'samsung' }
         elseif ($hint -match 'WATCH') { 'watch' }
         elseif ($hint -match 'MAC|LAPTOP|LENOVO|DELL') { 'mac' } else { 'khac' }
  if ($g[5].Value -eq 'used' -or ($g[9].Value -and $g[10].Value)) {
    $items.Add([ordered]@{ s = 'u'; c = $cat; n = $name; p = $price; col = (Clean $g[8].Value); cap = (Clean $g[9].Value); pin = (Clean $g[10].Value); note = (Clean $g[13].Value) })
  } else {
    $items.Add([ordered]@{ s = 'n'; c = $cat; n = $name; p = $price; st = (Clean $g[4].Value); o = (Clean $g[12].Value); note = (Clean $g[13].Value) })
  }
}

$json = [ordered]@{ updated = $updated; items = $items } | ConvertTo-Json -Depth 4 -Compress
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'kho-may.json'), $json, $utf8)
$n = @($items | Where-Object { $_.s -eq 'n' }).Count
Write-Host "Da lay kho tu trang lovable: $n may new, $($items.Count - $n) may co san (cap nhat $updated)."
