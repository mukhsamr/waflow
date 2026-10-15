param([string]$BaseUrl = 'http://127.0.0.1:8787')
$ErrorActionPreference = 'Stop'
$vars = @{}
foreach ($line in Get-Content (Join-Path $PSScriptRoot '../.dev.vars')) {
  if ($line -match '^([A-Z_]+)=(.*)$') { $vars[$Matches[1]] = $Matches[2].Trim('"').Trim("'") }
}
$login = Invoke-RestMethod "$BaseUrl/auth/login" -Method Post -ContentType application/json -Body (@{ email=$vars.ADMIN_EMAIL; password=$vars.ADMIN_PASSWORD } | ConvertTo-Json)
$headers = @{ Authorization="Bearer $($login.token)" }
function ExpectStatus($path, $method, $body, $expected, $auth = $headers) {
  $args = @{ Uri="$BaseUrl$path"; Method=$method; Headers=$auth; SkipHttpErrorCheck=$true }
  if ($body) { $args.ContentType='application/json'; $args.Body=($body | ConvertTo-Json) }
  $response = Invoke-WebRequest @args
  if ($response.StatusCode -ne $expected) { throw "$method $path expected $expected, got $($response.StatusCode)" }
}
ExpectStatus '/messages' Get $null 401 @{}
ExpectStatus '/messages' Post @{text='test'} 401 @{}
ExpectStatus '/messages' Post @{text='test'} 400
ExpectStatus '/messages?before=invalid' Get $null 400
$session = Invoke-RestMethod "$BaseUrl/sessions" -Method Post -Headers $headers -ContentType application/json -Body '{"name":"messaging-smoke-disconnected"}'
try {
  $body = @{sessionId=$session.id;recipient='628123456789';text='Must never be sent';idempotencyKey=[guid]::NewGuid().ToString()}
  ExpectStatus '/messages' Post $body 409
  $body.recipient='invalid'
  ExpectStatus '/messages' Post $body 400
  $history=Invoke-RestMethod "$BaseUrl/messages?sessionId=$($session.id)" -Headers $headers
  if ($history.messages.Count -ne 0) { throw 'Rejected request wrote message history' }
} finally { Invoke-RestMethod "$BaseUrl/sessions/$($session.id)/remove" -Method Post -Headers $headers | Out-Null }
$key=Invoke-RestMethod "$BaseUrl/auth/api-keys" -Method Post -Headers $headers -ContentType application/json -Body '{"name":"messaging-smoke"}'
try { ExpectStatus '/messages' Get $null 200 @{Authorization="Bearer $($key.token)"} }
finally { Invoke-RestMethod "$BaseUrl/auth/api-keys/$($key.id)" -Method Delete -Headers $headers | Out-Null }
ExpectStatus '/messages' Get $null 401 @{Authorization="Bearer $($key.token)"}
ExpectStatus '/messages/stats' Get $null 200
Write-Output 'Messaging Worker smoke passed: access, validation, disconnected send, history, API-key revocation.'
