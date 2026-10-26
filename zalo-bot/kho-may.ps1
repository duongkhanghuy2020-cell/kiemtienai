# Đọc file Excel kho máy (máy new + máy 99%) => zalo-bot\kho-may.json cho bot.
# Không lấy cột IMEI (kho code trên GitHub để công khai).
# Chạy: powershell -ExecutionPolicy Bypass -File zalo-bot\kho-may.ps1 [-Xlsx "<đường dẫn file>"]
param([string]$Xlsx = '')

# Không chỉ định file thì lấy bản mới nhất "KHO M*.xlsx" ở Desktop, Desktop\New folder, Downloads, D:\Claude Agent
if (-not $Xlsx) {
  $found = Get-ChildItem -Path "$env:USERPROFILE\Desktop", "$env:USERPROFILE\Desktop\New folder", "$env:USERPROFILE\Downloads", (Split-Path -Parent $PSScriptRoot) -Filter 'KHO M*.xlsx' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($found) { $Xlsx = $found.FullName }
}
if (-not $Xlsx -or -not (Test-Path -LiteralPath $Xlsx)) { Write-Host "Khong thay file kho may (giu kho-may.json cu)"; exit 0 }
Write-Host "Doc file kho: $Xlsx"

$tmp = Join-Path $env:TEMP "kho-may-$PID"
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $tmp | Out-Null
Copy-Item -LiteralPath $Xlsx "$tmp\kho.zip"
Expand-Archive "$tmp\kho.zip" "$tmp\x" -Force

function Text($node) { if ($null -eq $node) { '' } elseif ($node.'#text') { $node.'#text' } else { [string]$node } }

[xml]$ss = Get-Content -Raw -Encoding UTF8 "$tmp\x\xl\sharedStrings.xml"
$strings = foreach ($si in $ss.sst.si) {
  if ($si.t) { Text $si.t } else { ($si.r | ForEach-Object { Text $_.t }) -join '' }
}
[xml]$sh = Get-Content -Raw -Encoding UTF8 "$tmp\x\xl\worksheets\sheet1.xml"

function Clean($s) { ("$s".Normalize([Text.NormalizationForm]::FormKC) -replace '\s+', ' ').Trim() }
function Price($v) {
  $v = Clean $v
  if ($v -match '^[\d.]+(E\d+)?$') { return [long][double]::Parse($v, [Globalization.CultureInfo]::InvariantCulture) }
  if ($v -match 'CALL') { return 0 }
  return -1 # HẾT RỒI / trống => bỏ qua
}

$items = New-Object System.Collections.Generic.List[object]
$section = 'n'; $cat = 'iphone'; $updated = ''
foreach ($row in $sh.worksheet.sheetData.row) {
  $c = @{}
  foreach ($cell in $row.c) {
    $col = $cell.r -replace '\d', ''
    $v = if ($cell.t -eq 's') { $strings[[int]$cell.v] } elseif ($cell.t -eq 'inlineStr') { Text $cell.is.t } else { $cell.v }
    if ("$v".Trim()) { $c[$col] = Clean $v }
  }
  if (-not $c.A) { continue }
  $a = $c.A
  # Dòng tiêu đề bảng máy có sẵn => bắt đầu phần máy 99%
  if ($a -eq 'MÁY' -and $c.F -eq 'GIÁ BÁN') { $section = 'u'; continue }
  if ($c.H -match 'CẬP NHẬT\s*(.+)') { $updated = $Matches[1].Trim() }

  if ($section -eq 'n') {
    if ($a -match '^★|NEW SEAL') { $cat = if ($a -match '(?i)ipad') { 'ipad' } else { 'iphone' }; continue }
    if (-not $c.B -or $a -match 'TÊN SẢN PHẨM') { continue }
    $p = Price $c.B
    if ($p -lt 0) { continue }
    $items.Add([ordered]@{ s = 'n'; c = $cat; n = $a; p = $p; st = "$($c.C)"; o = "$($c.E)"; note = "$($c.F)" })
  } else {
    if (-not $c.F) {
      $h = $a.ToUpper()
      $cat = if ($h -match 'IPAD') { 'ipad' } elseif ($h -match 'MACBOOK') { 'mac' } elseif ($h -match 'WATCH') { 'watch' } elseif ($h -match 'SAMSUNG') { 'samsung' } else { 'iphone' }
      continue
    }
    $p = Price $c.F
    if ($p -lt 0) { continue }
    $pin = "$($c.E)"
    if ($pin -match '^[\d.]+$') { $pin = "$([math]::Round([double]::Parse($pin, [Globalization.CultureInfo]::InvariantCulture) * 100))%" }
    $items.Add([ordered]@{ s = 'u'; c = $cat; n = $a; p = $p; col = "$($c.B)"; cap = "$($c.C)"; pin = $pin; note = "$($c.G)" })
  }
}
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

$json = [ordered]@{ updated = $updated; items = $items } | ConvertTo-Json -Depth 4 -Compress
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'kho-may.json'), $json, (New-Object Text.UTF8Encoding $false))
$n = @($items | Where-Object { $_.s -eq 'n' }).Count
Write-Host "Da doc kho: $n may new, $($items.Count - $n) may co san (cap nhat $updated)."
