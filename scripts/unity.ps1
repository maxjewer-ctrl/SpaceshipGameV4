param(
  [Parameter(Position = 0)]
  [ValidateSet("doctor", "setup", "sim-test", "unity-test", "test", "build-web-dev", "serve-web", "verify")]
  [string] $Command = "doctor",

  [int] $Port = 5174
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$UnityProject = Join-Path $RepoRoot "unity"
$DefaultUnity = "C:\Program Files\Unity\Hub\Editor\6000.4.2f1\Editor\Unity.exe"
$UnityExe = if ($env:UNITY_EXE) { $env:UNITY_EXE } else { $DefaultUnity }

function Assert-Unity {
  if (!(Test-Path $UnityExe)) {
    throw "Unity editor not found at '$UnityExe'. Set UNITY_EXE to the editor path."
  }
}

function Invoke-Unity {
  param(
    [string[]] $UnityArgs,
    [switch] $NoQuit
  )

  Assert-Unity
  $logs = Join-Path $UnityProject "Logs"
  New-Item -ItemType Directory -Force -Path $logs | Out-Null
  $logFile = Join-Path $logs "batch-$($UnityArgs -join '-').log"
  $logFile = $logFile -replace '[\\/:*?"<>|]', '_'
  $logFile = Join-Path $logs (Split-Path $logFile -Leaf)
  $baseArgs = @("-batchmode", "-nographics", "-logFile", $logFile, "-projectPath", $UnityProject)
  if (!$NoQuit) {
    $baseArgs += "-quit"
  }
  $unityArgs = $baseArgs + $UnityArgs
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $UnityExe
  $psi.UseShellExecute = $false
  foreach ($arg in $unityArgs) {
    [void] $psi.ArgumentList.Add($arg)
  }
  $process = [System.Diagnostics.Process]::Start($psi)
  $process.WaitForExit()
  $exit = $process.ExitCode
  if ($exit -ne 0) {
    if (Test-Path $logFile) {
      Get-Content -Tail 80 $logFile
    }
    throw "Unity command failed with exit code $exit."
  }
}

function Invoke-SimTests {
  dotnet test (Join-Path $UnityProject "Kestrel.Sim.Tests\Kestrel.Sim.Tests.csproj")
  if ($LASTEXITCODE -ne 0) {
    throw "dotnet test failed with exit code $LASTEXITCODE."
  }
}

function Invoke-UnityTests {
  $results = Join-Path $UnityProject "TestResults"
  New-Item -ItemType Directory -Force -Path $results | Out-Null
  Invoke-Unity -NoQuit -UnityArgs @("-runTests", "-testPlatform", "editmode", "-testResults", (Join-Path $results "editmode.xml"))
  Invoke-Unity -NoQuit -UnityArgs @("-runTests", "-testPlatform", "playmode", "-testResults", (Join-Path $results "playmode.xml"))
}

switch ($Command) {
  "doctor" {
    Write-Host "Repo: $RepoRoot"
    Write-Host "Unity project: $UnityProject"
    Write-Host "Unity editor: $UnityExe"
    if (Test-Path $UnityExe) {
      & $UnityExe -version
    }
    dotnet --version
    $webgl = Join-Path (Split-Path $UnityExe -Parent) "Data\PlaybackEngines\WebGLSupport"
    if (!(Test-Path $webgl)) {
      throw "WebGL support module was not found for this Unity editor."
    }
    Write-Host "WebGL support: $webgl"
  }
  "setup" {
    Invoke-Unity -UnityArgs @("-executeMethod", "Kestrel.Editor.KestrelProjectSetup.EnsureProject")
  }
  "sim-test" {
    Invoke-SimTests
  }
  "unity-test" {
    Invoke-UnityTests
  }
  "test" {
    Invoke-SimTests
    Invoke-UnityTests
  }
  "build-web-dev" {
    Invoke-Unity -UnityArgs @("-buildTarget", "WebGL", "-executeMethod", "Kestrel.Editor.KestrelBuild.BuildWebDev")
  }
  "serve-web" {
    $build = Join-Path $UnityProject "Builds\WebGLDev"
    if (!(Test-Path (Join-Path $build "index.html"))) {
      throw "WebGL build not found. Run: scripts\unity.ps1 build-web-dev"
    }
    Write-Host "Serving Unity WebGL build at http://127.0.0.1:$Port"
    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
      python -m http.server $Port -d $build
    } else {
      py -3 -m http.server $Port -d $build
    }
  }
  "verify" {
    $build = Join-Path $UnityProject "Builds\WebGLDev"
    $index = Join-Path $build "index.html"
    if (!(Test-Path $index)) {
      throw "Missing WebGL build index.html. Run: scripts\unity.ps1 build-web-dev"
    }
    Get-ChildItem (Join-Path $build "Build") -ErrorAction Stop | Out-Null
    Write-Host "WebGL build files exist under $build"
  }
}
