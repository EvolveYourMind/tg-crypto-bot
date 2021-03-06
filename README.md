# tg-crypto-bot
A telegram bot for crypto prices monitoring based on the [coinbase API](https://docs.pro.coinbase.com)

Try it out here: [evobot](https://t.me/Evo_3000_bot)

## Commands
Ping:
```
/ping
```

Get the last trade:
```
/ticker btc-eur
```

Subscribe to get a notification when a price surpasses a certain target:
```
/target btc-eur 35000
```

List active subscriptions:
```
/list
```

Unsubscribe from all subscriptions:
```
/unsub_all
```

Unsubscribe from a specific subscription (id: 1614845638872):
```
/unsub_1614845638872
```

Get a line chart of the prices of the last 100 trades:
```
/chart btc-eur
```

Get a candles chart of the market for the last 2 hours with a granularity of 1 minute:
```
/candles btc-eur
```

Get candles chart with specific time range (eg. last 24 hours) and granularity (eg. 900 seconds = 15 minutes):
```
/candles btc-eur 24 900
```
The granularity can only be one of `{ 60, 300, 900, 3600, 21600, 86400 }`. \
The maximum number of candles requested is limited to 300. \
The api request will fail for higher values.
