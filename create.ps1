[CmdletBinding()]
param(
    [Parameter()]
    [string]$Source,

    [Parameter()]
    [ValidatePattern('^[A-Za-z]:?$')]
    [string]$Drive,

    [Parameter()]
    [switch]$KeepMounted
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Repository = 'atcasanova/DEFCON-34-badge-firmware'
$BadgeLabel = 'BAOCHIP'
$Uf2Family = [Convert]::ToUInt32('A7D76373', 16)
$Uf2MagicStart0 = [Convert]::ToUInt32('0A324655', 16)
$Uf2MagicStart1 = [Convert]::ToUInt32('9E5D5157', 16)
$Uf2MagicEnd = [Convert]::ToUInt32('0AB16F30', 16)
$Artifacts = @('loader.uf2', 'xous.uf2', 'swap.uf2')
$ScriptRoot = $PSScriptRoot
$TemporaryDirectory = $null

function Assert-Dependencies {
    Import-Module Storage -ErrorAction SilentlyContinue
    $RequiredCommands = @(
        'Get-FileHash',
        'Get-Volume',
        'Invoke-RestMethod',
        'Invoke-WebRequest'
    )
    $Missing = @($RequiredCommands | Where-Object { -not (Get-Command $_ -ErrorAction SilentlyContinue) })
    if ($Missing.Count -gt 0) {
        throw "This script needs Windows PowerShell 5.1+ or PowerShell 7+. Missing built-ins: $($Missing -join ', ')"
    }
    Write-Host 'Dependency check passed; Windows flashing uses only built-in PowerShell commands.'
}

function Test-ArtifactSet([string]$Directory) {
    if (-not (Test-Path -LiteralPath $Directory -PathType Container)) {
        return $false
    }
    foreach ($Artifact in $Artifacts) {
        if (-not (Test-Path -LiteralPath (Join-Path $Directory $Artifact) -PathType Leaf)) {
            return $false
        }
    }
    return $true
}

function Get-ChecksumFile([string]$Directory) {
    $Canonical = Join-Path $Directory 'SHA256SUMS.txt'
    if (Test-Path -LiteralPath $Canonical -PathType Leaf) {
        return $Canonical
    }
    $Candidate = Get-ChildItem -LiteralPath $Directory -File -Filter 'dc34-badgebloom-firmware-*-SHA256SUMS.txt' |
        Sort-Object Name |
        Select-Object -First 1
    if ($null -ne $Candidate) {
        return $Candidate.FullName
    }
    return $null
}

function Get-BadgeVolume {
    if ($Drive) {
        $Letter = $Drive.Substring(0, 1).ToUpperInvariant()
        $Volume = Get-Volume -DriveLetter $Letter -ErrorAction SilentlyContinue
        if ($null -eq $Volume) {
            throw "Drive $Letter`: is not mounted."
        }
        if ($Volume.FileSystemLabel -ne $BadgeLabel) {
            throw "Refusing ${Letter}: its label is '$($Volume.FileSystemLabel)', not $BadgeLabel."
        }
        return $Volume
    }

    $Volumes = @(Get-Volume | Where-Object { $_.FileSystemLabel -eq $BadgeLabel -and $null -ne $_.DriveLetter })
    if ($Volumes.Count -eq 0) {
        throw 'No BAOCHIP volume found. Disconnect USB, hold any badge button while resetting or power-cycling, release it at Update mode, then connect USB.'
    }
    if ($Volumes.Count -gt 1) {
        throw 'Multiple BAOCHIP volumes found. Select one with -Drive E: (using its actual letter).'
    }
    return $Volumes[0]
}

function Get-LatestFirmware {
    $script:TemporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) ("badgebloom-flash-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $script:TemporaryDirectory | Out-Null

    [Net.ServicePointManager]::SecurityProtocol =
        [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $Headers = @{
        Accept = 'application/vnd.github+json'
        'User-Agent' = 'BadgeBloom-flash-script'
    }
    $Release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repository/releases/latest" -Headers $Headers
    $Tag = [string]$Release.tag_name
    if ([string]::IsNullOrWhiteSpace($Tag)) {
        throw 'GitHub did not return a release tag.'
    }
    $ReleaseBase = "https://github.com/$Repository/releases/download/$Tag"
    Write-Host "Downloading BadgeBloom $Tag..."

    foreach ($Artifact in $Artifacts) {
        Invoke-WebRequest -UseBasicParsing -Uri "$ReleaseBase/$Artifact" -OutFile (Join-Path $script:TemporaryDirectory $Artifact)
    }
    $ChecksumName = "dc34-badgebloom-firmware-$Tag-SHA256SUMS.txt"
    Invoke-WebRequest -UseBasicParsing -Uri "$ReleaseBase/$ChecksumName" -OutFile (Join-Path $script:TemporaryDirectory 'SHA256SUMS.txt')
    return $script:TemporaryDirectory
}

function Assert-Uf2Image([string]$Path) {
    $Info = Get-Item -LiteralPath $Path
    if ($Info.Length -lt 512 -or ($Info.Length % 512) -ne 0) {
        throw "$($Info.Name) does not have a valid UF2 block size."
    }

    $Bytes = New-Object byte[] 512
    $Stream = [IO.File]::OpenRead($Path)
    try {
        if ($Stream.Read($Bytes, 0, $Bytes.Length) -ne $Bytes.Length) {
            throw "$($Info.Name) has a truncated UF2 block."
        }
    }
    finally {
        $Stream.Dispose()
    }

    $Magic0 = [BitConverter]::ToUInt32($Bytes, 0)
    $Magic1 = [BitConverter]::ToUInt32($Bytes, 4)
    $Family = [BitConverter]::ToUInt32($Bytes, 28)
    $MagicEnd = [BitConverter]::ToUInt32($Bytes, 508)
    if ($Magic0 -ne $Uf2MagicStart0 -or
        $Magic1 -ne $Uf2MagicStart1 -or
        $MagicEnd -ne $Uf2MagicEnd -or
        $Family -ne $Uf2Family) {
        throw "$($Info.Name) is not a Baochip 0x$($Uf2Family.ToString('x8')) UF2 image."
    }
}

function Assert-Artifacts([string]$Directory, [string]$ChecksumFile) {
    if ([string]::IsNullOrWhiteSpace($ChecksumFile) -or -not (Test-Path -LiteralPath $ChecksumFile -PathType Leaf)) {
        throw "No firmware SHA256SUMS file found in $Directory."
    }
    $ChecksumLines = @(Get-Content -LiteralPath $ChecksumFile)
    foreach ($Artifact in $Artifacts) {
        $Pattern = '^\s*([0-9a-fA-F]{64})\s+\*?' + [Regex]::Escape($Artifact) + '\s*$'
        $Match = $null
        foreach ($Line in $ChecksumLines) {
            if ($Line -match $Pattern) {
                $Match = $Matches[1].ToLowerInvariant()
                break
            }
        }
        if ($null -eq $Match) {
            throw "$Artifact is not covered by $ChecksumFile."
        }
        $ArtifactPath = Join-Path $Directory $Artifact
        $Actual = (Get-FileHash -LiteralPath $ArtifactPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($Actual -ne $Match) {
            throw "Checksum mismatch for $Artifact."
        }
        Assert-Uf2Image $ArtifactPath
        Write-Host "$Artifact`: verified"
    }
}

function Dismount-Badge([char]$DriveLetter) {
    try {
        $Shell = New-Object -ComObject Shell.Application
        $DriveItem = $Shell.Namespace(17).ParseName("$DriveLetter`:")
        if ($null -eq $DriveItem) {
            throw 'Windows Shell did not return the removable drive.'
        }
        $DriveItem.InvokeVerb('Eject')
        Start-Sleep -Seconds 2
        Write-Host "Requested safe eject for $DriveLetter`:"
    }
    catch {
        Write-Warning "Firmware was copied, but automatic eject failed: $($_.Exception.Message)"
        Write-Warning "Use Safely Remove Hardware on $DriveLetter`: before pressing the final badge button."
    }
}

try {
    Assert-Dependencies
    $Badge = Get-BadgeVolume
    $DriveRoot = "$($Badge.DriveLetter):\"
    Write-Host "Found $BadgeLabel in Update mode at $DriveRoot"

    if ($Source) {
        $FirmwareDirectory = (Resolve-Path -LiteralPath $Source).Path
    }
    elseif (Test-ArtifactSet (Join-Path $ScriptRoot 'firmware-build')) {
        $FirmwareDirectory = Join-Path $ScriptRoot 'firmware-build'
        Write-Host "Using locally built firmware from $FirmwareDirectory."
    }
    elseif (Test-ArtifactSet $ScriptRoot) {
        $FirmwareDirectory = $ScriptRoot
        Write-Host 'Using firmware beside create.ps1.'
    }
    else {
        $FirmwareDirectory = Get-LatestFirmware
    }

    $ChecksumFile = Get-ChecksumFile $FirmwareDirectory
    Assert-Artifacts $FirmwareDirectory $ChecksumFile

    Write-Host "Flashing verified firmware to $DriveRoot..."
    foreach ($Artifact in $Artifacts) {
        Write-Host "  copying $Artifact"
        Copy-Item -LiteralPath (Join-Path $FirmwareDirectory $Artifact) -Destination (Join-Path $DriveRoot $Artifact) -Force
    }

    if (-not $KeepMounted) {
        Dismount-Badge $Badge.DriveLetter
    }
    else {
        Write-Host 'Firmware copied; -KeepMounted left the badge mounted. Eject it before continuing.'
    }

    Write-Host 'Flash complete.' -ForegroundColor Green
    Write-Host 'While the badge remains powered, press any badge button to finalize the update and boot.'
}
finally {
    if ($null -ne $TemporaryDirectory -and (Test-Path -LiteralPath $TemporaryDirectory)) {
        Remove-Item -LiteralPath $TemporaryDirectory -Recurse -Force
    }
}
