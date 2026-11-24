# 檔案導讀：霓光突擊的本機伺服器（給沒有安裝 Node.js 的電腦用）。
# 由「開始遊戲.cmd」啟動，只在這台電腦上提供遊戲檔案；
# GitHub Pages 上的玩家不需要執行這個檔案。
# 參數：-OpenBrowser 啟動後自動開啟瀏覽器；-Port 使用的連接埠。
param(
  [switch]$OpenBrowser,
  [int]$Port = 4173
)

$ErrorActionPreference = 'Stop'

# 遊戲資料夾；只允許讀取這個資料夾裡面的檔案。
$root = [System.IO.Path]::GetFullPath(
  (Split-Path -Parent $MyInvocation.MyCommand.Path)
)
$rootPrefix = $root.TrimEnd([System.IO.Path]::DirectorySeparatorChar) +
  [System.IO.Path]::DirectorySeparatorChar
$gameUrl = "http://localhost:$Port/"

# 副檔名對應的內容類型。
$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.png'  = 'image/png'
  '.svg'  = 'image/svg+xml'
  '.wav'  = 'audio/wav'
  '.mp3'  = 'audio/mpeg'
  '.ogg'  = 'audio/ogg'
}

# 送出一個 HTTP 回應；HeadOnly 時只送標頭。
function Send-HttpResponse {
  param(
    [System.IO.Stream]$Stream,
    [int]$StatusCode,
    [string]$StatusText,
    [string]$ContentType,
    [byte[]]$Body,
    [bool]$HeadOnly = $false
  )
  $header = "HTTP/1.1 $StatusCode $StatusText`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  if (-not $HeadOnly -and $Body.Length -gt 0) {
    $Stream.Write($Body, 0, $Body.Length)
  }
  $Stream.Flush()
}

# 讀取請求的標頭，回傳第一行（例如 GET /index.html HTTP/1.1）。
# 限制時間、總長度、行數與單行長度，避免不完整的連線一直占住伺服器。
function Read-RequestHeader {
  param([System.IO.Stream]$Stream)
  $reader = [System.IO.StreamReader]::new(
    $Stream, [System.Text.Encoding]::ASCII, $false, 1024, $true
  )
  $line = [System.Text.StringBuilder]::new()
  $requestLine = $null
  $totalLength = 0
  $lineCount = 0
  $elapsed = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    while ($true) {
      # 最多等 3 秒。
      $remaining = 3000 - [int]$elapsed.ElapsedMilliseconds
      if ($remaining -le 0) {
        throw [System.TimeoutException]::new('Request header timed out.')
      }
      $Stream.ReadTimeout = $remaining
      $next = $reader.Read()
      if ($next -lt 0) {
        throw [System.IO.EndOfStreamException]::new('Incomplete request header.')
      }
      $totalLength++
      if ($totalLength -gt 16384) {
        throw [System.IO.InvalidDataException]::new('Request header is too large.')
      }
      if ($next -eq 10) {
        # 換行：第一行是請求內容，空行代表標頭結束。
        $text = $line.ToString().TrimEnd([char]13)
        [void]$line.Clear()
        $lineCount++
        if ($lineCount -gt 64) {
          throw [System.IO.InvalidDataException]::new('Too many request headers.')
        }
        if ($null -eq $requestLine) { $requestLine = $text }
        elseif ($text.Length -eq 0) { return $requestLine }
      } else {
        [void]$line.Append([char]$next)
        if ($line.Length -gt 4096) {
          throw [System.IO.InvalidDataException]::new('Request header line is too long.')
        }
      }
    }
  } finally {
    $reader.Dispose()
    $elapsed.Stop()
  }
}

# 只在本機（127.0.0.1）等待連線，其他電腦連不進來。
$listener = [System.Net.Sockets.TcpListener]::new(
  [System.Net.IPAddress]::Loopback, $Port
)
try {
  $listener.Start()
} catch {
  # 啟動失敗：如果是同一款遊戲已經在執行，就直接打開它。
  $socketError = $_.Exception
  while ($socketError.InnerException) { $socketError = $socketError.InnerException }
  if (
    $socketError -is [System.Net.Sockets.SocketException] -and
    $socketError.SocketErrorCode -eq
      [System.Net.Sockets.SocketError]::AddressAlreadyInUse
  ) {
    try {
      $existing = Invoke-WebRequest -Uri $gameUrl -UseBasicParsing -TimeoutSec 3
      if ($existing.Content -match 'NEON STRIKE // 3D') {
        Write-Host "NEON STRIKE is already running at $gameUrl" -ForegroundColor Yellow
        if ($OpenBrowser) { Start-Process $gameUrl }
        exit 0
      }
    } catch {}
    Write-Host "[ERROR] Port $Port is already in use by another program. Close it and try again." -ForegroundColor Red
  } else {
    Write-Host "[ERROR] Could not start the local game server: $($socketError.Message)" -ForegroundColor Red
  }
  exit 1
}

Write-Host "NEON STRIKE ready at $gameUrl" -ForegroundColor Green
Write-Host 'Keep this window open while playing. Press Ctrl+C to stop.' -ForegroundColor DarkGray
if ($OpenBrowser) { Start-Process $gameUrl }

# 主迴圈：一次處理一個請求，直到視窗關閉或按 Ctrl+C。
try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $client.ReceiveTimeout = 3000
      $client.SendTimeout = 3000
      $stream = $client.GetStream()
      $stream.WriteTimeout = 3000
      $requestLine = Read-RequestHeader $stream

      # 只接受 GET 與 HEAD。
      if ($requestLine -notmatch '^(GET|HEAD)\s+([^\s]+)\s+HTTP/') {
        $body = [System.Text.Encoding]::UTF8.GetBytes('Bad Request')
        Send-HttpResponse $stream 400 'Bad Request' 'text/plain; charset=utf-8' $body
        continue
      }

      # 網址換成檔案路徑；超出遊戲資料夾或不存在都回 404。
      $method = $Matches[1]
      $urlPath = ($Matches[2] -split '\?')[0]
      $decodedPath = [System.Uri]::UnescapeDataString($urlPath)
      if ($decodedPath -eq '/') { $decodedPath = '/index.html' }
      $relativePath = $decodedPath.TrimStart('/').Replace(
        '/', [System.IO.Path]::DirectorySeparatorChar
      )
      $filePath = [System.IO.Path]::GetFullPath((Join-Path $root $relativePath))
      $insideRoot = $filePath.StartsWith(
        $rootPrefix, [System.StringComparison]::OrdinalIgnoreCase
      )

      if (
        -not $insideRoot -or
        -not (Test-Path -LiteralPath $filePath -PathType Leaf)
      ) {
        $body = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
        Send-HttpResponse $stream 404 'Not Found' 'text/plain; charset=utf-8' $body ($method -eq 'HEAD')
        continue
      }

      # 送出檔案內容。
      $extension = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
      $contentType = if ($mime.ContainsKey($extension)) {
        $mime[$extension]
      } else {
        'application/octet-stream'
      }
      $body = [System.IO.File]::ReadAllBytes($filePath)
      Send-HttpResponse $stream 200 'OK' $contentType $body ($method -eq 'HEAD')
    } catch {
      # 依錯誤種類回應對應的狀態碼。
      $statusCode = 500
      $statusText = 'Internal Server Error'
      $requestError = $_.Exception
      while ($requestError) {
        if ($requestError -is [System.IO.InvalidDataException]) {
          $statusCode = 431
          $statusText = 'Request Header Fields Too Large'
          break
        }
        if ($requestError -is [System.IO.EndOfStreamException]) {
          $statusCode = 400
          $statusText = 'Bad Request'
          break
        }
        if (
          $requestError -is [System.TimeoutException] -or
          (
            $requestError -is [System.Net.Sockets.SocketException] -and
            $requestError.SocketErrorCode -eq
              [System.Net.Sockets.SocketError]::TimedOut
          )
        ) {
          $statusCode = 408
          $statusText = 'Request Timeout'
          break
        }
        $requestError = $requestError.InnerException
      }
      try {
        $body = [System.Text.Encoding]::UTF8.GetBytes($statusText)
        Send-HttpResponse $stream $statusCode $statusText 'text/plain; charset=utf-8' $body
      } catch {}
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
