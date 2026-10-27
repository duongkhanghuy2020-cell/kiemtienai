# Gộp danh sách khách từ file KiotViet + các trang tính (.xlsx / .csv) trong thư mục khach-hang\
# => khach-hang\DANH-SACH-KHACH.csv (mở bằng Excel), bỏ trùng theo số điện thoại.
# Chạy: powershell -ExecutionPolicy Bypass -File zalo-bot\gop-khach.ps1
param([string]$Folder = (Join-Path (Split-Path -Parent $PSScriptRoot) 'khach-hang'))

$utf8 = New-Object Text.UTF8Encoding $false
$outName = 'DANH-SACH-KHACH.csv'

function Text($node) { if ($null -eq $node) { '' } elseif ($node.'#text') { $node.'#text' } else { [string]$node } }
function Clean($s) { ("$s" -replace '\s+', ' ').Trim() }
function Fold($s) { # bỏ dấu, chữ thường để so tên cột
  $d = "$s".ToLower().Replace('đ', 'd').Normalize([Text.NormalizationForm]::FormD)
  (-join ($d.ToCharArray() | Where-Object { [Globalization.CharUnicodeInfo]::GetUnicodeCategory($_) -ne 'NonSpacingMark' })).Trim()
}
function Phone($s) { # chuẩn hóa về dạng 0xxxxxxxxx
  $d = "$s" -replace '[^\d]', ''
  if ($d -match '^84(\d{9,10})$') { $d = '0' + $Matches[1] }
  if ($d -match '^\d{9}$') { $d = '0' + $d } # Excel làm mất số 0 đầu
  if ($d -match '^0\d{9,10}$') { return $d } else { return '' }
}

# Đọc bảng (danh sách các dòng, mỗi dòng là mảng ô) từ .xlsx (sheet đầu tiên) hoặc .csv
function Read-Table($file) {
  if ($file.Extension -eq '.csv') {
    return @(Get-Content -LiteralPath $file.FullName -Encoding UTF8 | ForEach-Object { , @($_ -split ',(?=(?:[^"]*"[^"]*")*[^"]*$)' | ForEach-Object { $_.Trim('"') }) })
  }
  $tmp = Join-Path $env:TEMP "gop-khach-$PID"
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory $tmp | Out-Null
  Copy-Item -LiteralPath $file.FullName "$tmp\f.zip"
  Expand-Archive "$tmp\f.zip" "$tmp\x" -Force
  $strings = @()
  if (Test-Path "$tmp\x\xl\sharedStrings.xml") {
    [xml]$ss = Get-Content -Raw -Encoding UTF8 "$tmp\x\xl\sharedStrings.xml"
    $strings = foreach ($si in $ss.sst.si) { if ($si.t) { Text $si.t } else { ($si.r | ForEach-Object { Text $_.t }) -join '' } }
  }
  $sheet = Get-ChildItem "$tmp\x\xl\worksheets\sheet*.xml" | Sort-Object Name | Select-Object -First 1
  [xml]$sh = Get-Content -Raw -Encoding UTF8 $sheet.FullName
  $rows = foreach ($row in $sh.worksheet.sheetData.row) {
    $cells = @{}
    foreach ($c in $row.c) {
      $col = 0; foreach ($ch in ($c.r -replace '\d', '').ToCharArray()) { $col = $col * 26 + ([int]$ch - 64) }
      $v = if ($c.t -eq 's') { $strings[[int]$c.v] } elseif ($c.t -eq 'inlineStr') { Text $c.is.t } else { $c.v }
      $cells[$col - 1] = Clean $v
    }
    $max = ($cells.Keys | Measure-Object -Maximum).Maximum
    if ($null -eq $max) { continue }
    , @(0..$max | ForEach-Object { $cells[$_] })
  }
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  return @($rows)
}

$all = [ordered]@{} # SĐT => bản ghi
$files = Get-ChildItem -LiteralPath $Folder -File | Where-Object { $_.Extension -in '.xlsx', '.csv' -and $_.Name -ne $outName }
if (-not $files) { Write-Host "Chua co file nao trong $Folder"; exit 0 }

foreach ($f in $files) {
  $rows = Read-Table $f
  # Dòng tiêu đề = dòng đầu tiên có cột điện thoại
  $hi = -1
  for ($i = 0; $i -lt [Math]::Min(15, $rows.Count); $i++) {
    if (@($rows[$i] | Where-Object { (Fold $_) -match 'dien thoai|sdt|so dt|phone|di dong' }).Count) { $hi = $i; break }
  }
  if ($hi -lt 0) { Write-Host "Bo qua $($f.Name): khong thay cot so dien thoai"; continue }
  $head = @($rows[$hi] | ForEach-Object { Fold $_ })
  $iPhone = [Array]::FindIndex($head, [Predicate[object]] { param($h) "$h" -match 'dien thoai|sdt|so dt|phone|di dong' })
  $iName = [Array]::FindIndex($head, [Predicate[object]] { param($h) "$h" -match '^(ten khach|khach hang|ho ten|ho va ten|ten)' -and "$h" -notmatch 'ma ' })
  $added = 0
  for ($r = $hi + 1; $r -lt $rows.Count; $r++) {
    $row = $rows[$r]
    $ph = Phone $row[$iPhone]
    if (-not $ph) { continue }
    $name = if ($iName -ge 0) { Clean $row[$iName] } else { '' }
    # Các cột khác (ngày mua, tổng tiền, ghi chú...) gom vào cột Thông tin
    $info = @(for ($k = 0; $k -lt $row.Count; $k++) { if ($k -ne $iPhone -and $k -ne $iName -and $row[$k]) { "$($rows[$hi][$k]): $($row[$k])" } }) -join ' | '
    if ($all.Contains($ph)) {
      $e = $all[$ph]
      if (-not $e.Ten -and $name) { $e.Ten = $name }
      if ($e.Nguon -notmatch [regex]::Escape($f.BaseName)) { $e.Nguon += "; $($f.BaseName)" }
      if ($info) { $e.ThongTin = (@($e.ThongTin, $info) | Where-Object { $_ }) -join ' || ' }
    } else {
      $all[$ph] = [pscustomobject]@{ SDT = $ph; Ten = $name; Nguon = $f.BaseName; Zalo = ''; ThongTin = $info }
      $added++
    }
  }
  Write-Host "$($f.Name): them $added khach"
}

$out = Join-Path $Folder $outName
$all.Values | Select-Object @{n='SĐT';e={$_.SDT}}, @{n='Tên khách';e={$_.Ten}}, @{n='Nguồn';e={$_.Nguon}}, @{n='Đã nhắn Zalo';e={$_.Zalo}}, @{n='Thông tin khác';e={$_.ThongTin}} |
  Export-Csv -LiteralPath $out -NoTypeInformation -Encoding UTF8
Write-Host "Tong cong $($all.Count) khach (da bo trung SDT) => $out"
