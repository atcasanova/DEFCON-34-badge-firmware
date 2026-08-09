[CmdletBinding()]
param(
    [Parameter()]
    [Alias('Source')]
    [string]$ZipFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$BadgeLabel = 'BAOCHIP'
$FirmwareUrl = 'https://defcon.org/34b/latest.zip'
$Artifacts = @('loader.uf2', 'xous.uf2', 'swap.uf2')
$TemporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) ("dc34-stock-" + [Guid]::NewGuid().ToString('N'))

function Get-BadgeVolume {
    $Volumes = @(Get-Volume | Where-Object {
        $_.FileSystemLabel -eq $BadgeLabel -and $null -ne $_.DriveLetter
    })

    if ($Volumes.Count -eq 0) {
        throw 'BAOCHIP drive not found. Confirm that the badge screen says Update mode and that USB is attached to Windows.'
    }
    if ($Volumes.Count -gt 1) {
        throw 'Multiple BAOCHIP drives were found. Disconnect all but the badge being recovered.'
    }

    return $Volumes[0]
}

function Dismount-Badge([char]$DriveLetter) {
    try {
        $Shell = New-Object -ComObject Shell.Application
        $DriveItem = $Shell.Namespace(17).ParseName("$DriveLetter`:")
        if ($null -eq $DriveItem) {
            throw 'Windows Shell did not return the removable drive.'
        }

        $DriveItem.InvokeVerb('Eject')
        Start-Sleep -Seconds 5
        Write-Host "BAOCHIP at $DriveLetter`: was ejected safely."
    }
    catch {
        Write-Warning "Automatic eject failed: $($_.Exception.Message)"
        Write-Warning "Use Safely Remove Hardware on $DriveLetter`: before pressing a badge button."
    }
}

try {
    Import-Module Storage -ErrorAction SilentlyContinue
    if (-not (Get-Command Get-Volume -ErrorAction SilentlyContinue)) {
        throw 'Get-Volume is unavailable. Run this on Windows PowerShell 5.1+ or PowerShell 7+ on Windows.'
    }

    New-Item -ItemType Directory -Path $TemporaryDirectory | Out-Null
    if ([string]::IsNullOrWhiteSpace($ZipFile)) {
        $Archive = Join-Path $TemporaryDirectory 'latest.zip'

        [Net.ServicePointManager]::SecurityProtocol =
            [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

        Write-Host "Downloading official DEF CON 34 firmware from $FirmwareUrl ..."
        Invoke-WebRequest -UseBasicParsing -Uri $FirmwareUrl -OutFile $Archive
    }
    else {
        if (-not (Test-Path -LiteralPath $ZipFile -PathType Leaf)) {
            throw "Local firmware archive not found: $ZipFile"
        }
        $Archive = (Resolve-Path -LiteralPath $ZipFile).Path
        Write-Host "Using local firmware archive: $Archive"
    }

    $ArchiveHash = (Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Host "latest.zip SHA-256: $ArchiveHash"

    Expand-Archive -LiteralPath $Archive -DestinationPath $TemporaryDirectory -Force
    foreach ($Artifact in $Artifacts) {
        $ArtifactPath = Join-Path $TemporaryDirectory $Artifact
        if (-not (Test-Path -LiteralPath $ArtifactPath -PathType Leaf)) {
            throw "The official archive is missing $Artifact. Nothing was copied to the badge."
        }
    }

    Write-Host ''
    Write-Host 'Put the badge into Update mode:' -ForegroundColor Cyan
    Write-Host '  1. Disconnect its USB cable.'
    Write-Host '  2. Hold any badge button.'
    Write-Host '  3. Press the flush reset panel on the lower-right edge.'
    Write-Host '  4. Release the button when the screen says Update mode.'
    Write-Host '  5. Connect USB directly to this Windows computer and wait for BAOCHIP.'
    Read-Host 'Press Enter after the BAOCHIP drive appears' | Out-Null

    $Badge = Get-BadgeVolume
    $Destination = "$($Badge.DriveLetter):\"
    Write-Host "Found $BadgeLabel at $Destination"

    foreach ($Artifact in $Artifacts) {
        Write-Host "Copying $Artifact ..."
        $CopyParameters = @{
            LiteralPath = Join-Path $TemporaryDirectory $Artifact
            Destination = $Destination
            Force = $true
        }
        Copy-Item @CopyParameters
        Start-Sleep -Seconds 8
        Write-Host "$Artifact copied."
    }

    Write-Host 'Waiting for pending writes...'
    Start-Sleep -Seconds 15
    Dismount-Badge $Badge.DriveLetter

    Write-Host ''
    Write-Host 'Official firmware copied.' -ForegroundColor Green
    Write-Host 'Keep the badge powered, press any badge button once to commit, and leave it untouched for at least one minute.'
}
finally {
    if (Test-Path -LiteralPath $TemporaryDirectory) {
        Remove-Item -LiteralPath $TemporaryDirectory -Recurse -Force
    }
}
