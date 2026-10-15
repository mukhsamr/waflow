param([string]$BaseUrl = 'http://127.0.0.1:8787', [string]$Email = 'admin@example.test', [string]$Password = 'password')
$ErrorActionPreference = 'Stop'
function Status($url, $headers) { (Invoke-WebRequest $url -Headers $headers -SkipHttpErrorCheck).StatusCode }
$login = Invoke-RestMethod "$BaseUrl/auth/login" -Method Post -ContentType 'application/json' -Body (@{ email=$Email; password=$Password } | ConvertTo-Json)
$session = @{ Authorization = "Bearer $($login.token)" }
if ((Status "$BaseUrl/auth/me" $session) -ne 200) { throw 'Valid session rejected' }
if ((Status "$BaseUrl/sessions" @{}) -ne 401) { throw 'Anonymous session access allowed' }
$tampered = @{ Authorization = "Bearer $($login.token.Substring(0, $login.token.Length - 1))x" }
if ((Status "$BaseUrl/auth/me" $tampered) -ne 401) { throw 'Tampered token accepted' }
$key = Invoke-RestMethod "$BaseUrl/auth/api-keys" -Method Post -Headers $session -ContentType 'application/json' -Body '{"name":"auth-smoke"}'
try {
  $apiKey = @{ Authorization = "Bearer $($key.token)" }
  if ((Status "$BaseUrl/sessions" $apiKey) -ne 200) { throw 'API key rejected' }
  if ((Status "$BaseUrl/auth/me" $apiKey) -ne 401) { throw 'API key accepted as panel session' }
} finally {
  Invoke-RestMethod "$BaseUrl/auth/api-keys/$($key.id)" -Method Delete -Headers $session | Out-Null
}
if ((Status "$BaseUrl/sessions" $apiKey) -ne 401) { throw 'Revoked API key accepted' }
Write-Output 'Auth smoke passed'
