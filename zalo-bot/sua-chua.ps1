# Lấy bảng giá sửa chữa từ trang https://khanghuyapple.lovable.app/bang-gia-sua-chua => zalo-bot\sua-chua.json
# Chạy: powershell -ExecutionPolicy Bypass -File zalo-bot\sua-chua.ps1
$base = 'https://khanghuyapple.lovable.app'
$utf8 = New-Object Text.UTF8Encoding $false

function Get-Html($url) {
  $tmp = [IO.Path]::GetTempFileName()
  & curl.exe -sL $url -o $tmp
  $html = [IO.File]::ReadAllText($tmp, $utf8)
  Remove-Item $tmp
  return $html
}
function Decode($s) { [Net.WebUtility]::HtmlDecode($s).Trim() }

$list = Get-Html "$base/bang-gia-sua-chua"
# Mỗi dòng máy: <a ... href="/bao-gia/<id>"> ... <img ... alt="iPhone 18 Pro"
$devices = [ordered]@{}
foreach ($m in [regex]::Matches($list, 'href="/bao-gia/([0-9a-f-]{36})"[\s\S]*?alt="([^"]+)"')) {
  if (-not $devices.Contains($m.Groups[1].Value)) { $devices[$m.Groups[1].Value] = Decode $m.Groups[2].Value }
}
if (-not $devices.Count) { Write-Host 'Khong doc duoc danh sach may (giu sua-chua.json cu)'; exit 0 }

$out = [ordered]@{}
foreach ($id in $devices.Keys) {
  $html = Get-Html "$base/bao-gia/$id"
  $rows = [ordered]@{}
  $re = '<span class="block text-sm font-medium">([^<]+)</span>(?:<span class="block text-xs text-muted-foreground">([^<]*)</span>)?</span><span class="text-sm font-semibold text-primary">([^<]+)</span>'
  foreach ($r in [regex]::Matches($html, $re)) {
    $name = Decode $r.Groups[1].Value
    $sub = Decode $r.Groups[2].Value
    $priceText = Decode $r.Groups[3].Value
    $digits = $priceText -replace '[^\d]', ''
    $price = if ($digits) { [long]$digits } else { 0 } # 0 = liên hệ báo giá
    $label = if ($sub -and $name.ToLower().IndexOf($sub.ToLower()) -lt 0) { "$name ($sub)" } else { $name }
    $rows[$label] = $price
  }
  $out[$devices[$id]] = $rows
  Write-Host "$($devices[$id]): $($rows.Count) dich vu"
}
$json = [ordered]@{ updated = (Get-Date -Format 'dd/MM/yyyy'); devices = $out } | ConvertTo-Json -Depth 4 -Compress
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'sua-chua.json'), $json, $utf8)
Write-Host "Da lay gia sua $($out.Count) dong may."
