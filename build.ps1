param(
    [string]$Python = "python",
    [string]$Version = "0.1.0",
    [string]$CompilerPath = "",
    [switch]$SkipInstaller
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
Set-Location -LiteralPath $ProjectRoot

if (-not (Test-Path -LiteralPath "app.py")) { throw "app.py tidak ditemukan di $ProjectRoot" }
if (-not (Test-Path -LiteralPath "requirements.txt")) { throw "requirements.txt tidak ditemukan di $ProjectRoot" }
if ($Version -notmatch '^\d+\.\d+\.\d+(\.\d+)?$') { throw "Version harus berupa angka, misalnya 0.1.0." }

& $Python -m venv .build-venv
if ($LASTEXITCODE -ne 0) { throw "Gagal membuat virtual environment. Gunakan Python 3.12 64-bit." }
$VenvPython = Join-Path $ProjectRoot ".build-venv\Scripts\python.exe"
& $VenvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw "Gagal memperbarui pip." }
& $VenvPython -m pip install -r requirements.txt "pyinstaller>=6,<7"
if ($LASTEXITCODE -ne 0) { throw "Gagal memasang dependensi build." }

$PyInstallerArgs = @(
    "-m", "PyInstaller", "--noconfirm", "--clean", "--windowed", "--onedir",
    "--name", "HY Print", "--distpath", "dist", "--workpath", "build\pyinstaller",
    "--specpath", "build", "--hidden-import", "win32timezone"
)
if (Test-Path -LiteralPath "assets" -PathType Container) {
    $PyInstallerArgs += @("--add-data", "assets;assets")
}
if (Test-Path -LiteralPath "assets\app.ico" -PathType Leaf) {
    $PyInstallerArgs += @("--icon", "assets\app.ico")
}
$PyInstallerArgs += "app.py"
& $VenvPython @PyInstallerArgs
if ($LASTEXITCODE -ne 0) { throw "PyInstaller gagal membuat aplikasi." }
& $VenvPython "installer\collect_licenses.py" "dist\HY Print\third_party_licenses"
if ($LASTEXITCODE -ne 0) { throw "Gagal mengumpulkan lisensi dependensi." }

if ($SkipInstaller) {
    Write-Host "Aplikasi tersedia di dist\HY Print\HY Print.exe"
    return
}

$Compiler = $CompilerPath
if (-not $Compiler) { $Compiler = (Get-Command makensis.exe -ErrorAction SilentlyContinue).Source }
if (-not $Compiler) {
    $Candidate = Join-Path ${env:ProgramFiles(x86)} "NSIS\makensis.exe"
    if (Test-Path -LiteralPath $Candidate) { $Compiler = $Candidate }
}
if (-not $Compiler) { throw "NSIS tidak ditemukan. Pasang NSIS atau gunakan -SkipInstaller." }
New-Item -ItemType Directory -Force -Path "dist\installer" | Out-Null
& $Compiler "/DAppVersion=$Version" "installer\HYPrint.nsi"
if ($LASTEXITCODE -ne 0) { throw "NSIS gagal membuat installer." }
Write-Host "Installer tersedia di dist\installer\HY-Print-Setup-$Version.exe"
