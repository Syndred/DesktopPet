param([int]$TimeoutSeconds = 16)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Devices.Geolocation.Geolocator, Windows.Devices.Geolocation, ContentType=WindowsRuntime]
  $null = [Windows.Devices.Geolocation.Geoposition, Windows.Devices.Geolocation, ContentType=WindowsRuntime]
  $locator = New-Object Windows.Devices.Geolocation.Geolocator
  $locator.DesiredAccuracyInMeters = 30
  # GetGeopositionAsync honors the OS privacy settings. Never enable fallback to consentless/IP positions.
  $operation = $locator.GetGeopositionAsync([TimeSpan]::FromSeconds(5), [TimeSpan]::FromSeconds($TimeoutSeconds))
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  } | Select-Object -First 1
  $task = $asTask.MakeGenericMethod([Windows.Devices.Geolocation.Geoposition]).Invoke($null, @($operation))
  $null = $task.Wait(($TimeoutSeconds + 2) * 1000)
  if (-not $task.IsCompleted) { throw [TimeoutException]::new('Windows location request timed out') }
  $pos = $task.GetAwaiter().GetResult()
  $coord = $pos.Coordinate
  $result = @{
    ok = $true; platform = 'win32'; provider = 'windows-geolocator'; status = $locator.LocationStatus.ToString()
    lat = $coord.Point.Position.Latitude; lng = $coord.Point.Position.Longitude
    accuracyMeters = $coord.Accuracy; timestampMs = $coord.Timestamp.ToUnixTimeMilliseconds()
    positionSource = $coord.PositionSource.ToString(); coordinateSystem = 'wgs84'; source = 'os'
  }
} catch {
  $exception = $_.Exception
  while ($exception.InnerException) { $exception = $exception.InnerException }
  $hr = ('0x{0:X8}' -f ($exception.HResult -band 0xffffffffL))
  $status = if ($locator) { $locator.LocationStatus.ToString() } else { 'NotAvailable' }
  $code = 'LOCATION_UNAVAILABLE'
  if ($hr -eq '0x80070005' -or $status -eq 'Disabled') { $code = 'LOCATION_PERMISSION_DENIED' }
  elseif ($exception -is [TimeoutException] -or $hr -eq '0x800705B4') { $code = 'LOCATION_TIMEOUT' }
  $result = @{ ok=$false; platform='win32'; provider='windows-geolocator'; status=$status; code=$code; hresult=$hr; message=$exception.Message }
}
$result | ConvertTo-Json -Compress
