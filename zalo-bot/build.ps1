# Tạo worker.js = worker.template.js + giá sửa (trang lovable) + kho máy bán (file Excel)
# Chạy: powershell -ExecutionPolicy Bypass -File zalo-bot\build.ps1
$utf8 = New-Object Text.UTF8Encoding $false
& (Join-Path $PSScriptRoot 'sua-chua.ps1')
& (Join-Path $PSScriptRoot 'kho-may.ps1')
$kho = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'kho-may.json'), $utf8)
$sua = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'sua-chua.json'), $utf8)
$tpl = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'worker.template.js'), $utf8)
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'worker.js'), $tpl.Replace('__KHO__', $kho).Replace('__SUA__', $sua), $utf8)
Write-Host 'Da tao worker.js.'
