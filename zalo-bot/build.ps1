# Tạo worker.js = worker.template.js + bảng giá mới nhất từ bang-gia-professional.html
# Chạy: powershell -ExecutionPolicy Bypass -File zalo-bot\build.ps1
$root = Split-Path -Parent $PSScriptRoot
$html = Get-Content -Raw -Encoding UTF8 (Join-Path $root 'bang-gia-professional.html')
$out = [ordered]@{}
foreach ($t in [regex]::Matches($html, '<table class="price-table">([\s\S]*?)</table>')) {
  $body = $t.Groups[1].Value
  $models = [regex]::Matches($body, '<th>([^<]+)</th>') | Select-Object -Skip 1 | ForEach-Object { $_.Groups[1].Value.Trim() }
  foreach ($r in [regex]::Matches($body, '<tr><td class="service-name">([^<]+)</td>(.*?)</tr>')) {
    $svc = $r.Groups[1].Value.Trim()
    $vals = @([regex]::Matches($r.Groups[2].Value, '<td class="[^"]+">([^<]+)</td>') | ForEach-Object { $_.Groups[1].Value.Trim() })
    for ($i = 0; $i -lt $models.Count; $i++) {
      if (-not $out.Contains($models[$i])) { $out[$models[$i]] = [ordered]@{} }
      $out[$models[$i]][$svc] = $vals[$i]
    }
  }
}
$json = $out | ConvertTo-Json -Depth 4 -Compress
$utf8 = New-Object Text.UTF8Encoding $false
# Kho máy bán (new + 99%): đọc lại từ file Excel nếu có, rồi nhúng kho-may.json
& (Join-Path $PSScriptRoot 'kho-may.ps1')
$kho = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'kho-may.json'), $utf8)
$tpl = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'worker.template.js'), $utf8)
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'worker.js'), $tpl.Replace('__PRICES__', $json).Replace('__KHO__', $kho), $utf8)
Write-Host "Da tao worker.js voi $($out.Count) dong may."
