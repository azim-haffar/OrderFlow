param(
    [string]$BaseUrl = 'http://localhost:8080',
    [string]$PostgresUser = 'orderflow'
)
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    $readyDeadline = (Get-Date).AddSeconds(60)
    do {
        try {
            Invoke-RestMethod "$BaseUrl/api/products" -TimeoutSec 5 | Out-Null
            $ready = $true
        } catch {
            $ready = $false
            Start-Sleep -Milliseconds 500
        }
    } while (-not $ready -and (Get-Date) -lt $readyDeadline)
    if (-not $ready) { throw 'The API did not become ready within 60 seconds' }
    function Query([string]$Sql) {
        $result = & docker compose exec -T postgres psql -U $PostgresUser -d orderflow -At -c $Sql
        if ($LASTEXITCODE -ne 0) { throw 'Database query failed' }
        return ($result -join "`n").Trim()
    }
    function Wait-Order([long]$Id, [string]$Expected) {
        $deadline = (Get-Date).AddSeconds(40)
        do {
            $order = Invoke-RestMethod "$BaseUrl/api/orders/$Id"
            if ($order.status -eq $Expected) { return $order }
            if ($order.status -ne 'PLACED') { throw "Unexpected status: $($order.status)" }
            Start-Sleep -Milliseconds 250
        } while ((Get-Date) -lt $deadline)
        throw "Order $Id did not reach $Expected"
    }
    # Run against a quiet local stack. Each execution consumes two units of stock.
    $before = [int](Query 'SELECT stock_quantity FROM products WHERE id = 1')
    if ($before -lt 2) { throw 'Product 1 needs at least two units; choose a fresh local demo database' }
    $placed = Invoke-RestMethod "$BaseUrl/api/orders" -Method Post -ContentType 'application/json' -Body (
        @{productId=1; quantity=2; customerId='internship-demo'} | ConvertTo-Json -Compress)
    $id = [long]$placed.id
    $confirmed = Wait-Order $id 'CONFIRMED'
    $after = [int](Query 'SELECT stock_quantity FROM products WHERE id = 1')
    if ($after -ne ($before - 2)) { throw 'Initial stock deduction was unexpected' }

    $payload = Query "SELECT payload FROM outbox_events WHERE aggregate_id = '$id' ORDER BY id LIMIT 1"
    if (-not $payload) { throw 'Outbox payload was not found' }
    "$id|$payload" | & docker compose exec -T kafka kafka-console-producer --bootstrap-server kafka:9092 `
        --topic order-events --property parse.key=true --property 'key.separator=|'
    if ($LASTEXITCODE -ne 0) { throw 'Duplicate publish failed' }
    $deadline = (Get-Date).AddSeconds(30)
    do {
        $logs = & docker compose logs --no-color --tail 250 backend 2>$null
        if ($LASTEXITCODE -ne 0) { throw 'Could not read backend logs' }
        $seen = ($logs -join "`n") -match "Ignoring delivery for terminal order $id \(CONFIRMED\)"
        if ($seen) { break }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)
    if (-not $seen) { throw 'Duplicate delivery was not observed by the consumer' }
    $replayedStock = [int](Query 'SELECT stock_quantity FROM products WHERE id = 1')
    if ($replayedStock -ne $after) { throw 'Duplicate delivery changed stock' }

    # A confirmed order cannot be cancelled after inventory has been committed.
    try {
        Invoke-RestMethod "$BaseUrl/api/orders/$id" -Method Delete | Out-Null
        throw 'Expected cancellation to return HTTP 409'
    } catch {
        if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 409) { throw }
    }
    $tooLarge = Invoke-RestMethod "$BaseUrl/api/orders" -Method Post -ContentType 'application/json' -Body (
        @{productId=1; quantity=($after + 1); customerId='insufficient-stock-demo'} | ConvertTo-Json -Compress)
    $cancelled = Wait-Order ([long]$tooLarge.id) 'CANCELLED'
    if ([int](Query 'SELECT stock_quantity FROM products WHERE id = 1') -ne $after) {
        throw 'Insufficient-stock cancellation changed stock'
    }
    [pscustomobject]@{
        ConfirmedOrder=$confirmed.id; StockBefore=$before; StockAfter=$after
        StockAfterDuplicate=$replayedStock; DuplicateObserved=$seen
        ConfirmedCancellationHttp=409; InsufficientStockOrder=$cancelled.id; FinalStatus=$cancelled.status
    }
} finally {
    Pop-Location
}
