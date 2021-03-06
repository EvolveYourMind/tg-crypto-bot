# tg-crypto-bot
A telegram bot for crypto prices monitoring based on the [coinbase API](https://docs.pro.coinbase.com) and [binance API](https://binance-docs.github.io/apidocs/).

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

Subscribe to get a notification when a price surpasses a certain target. Once reached, two new targets will be created to +-0.5%:
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

Get a candles chart of the market for the last 2 hours with a granularity of 1 minute:
```
/candles btc-eur
```

Get candles chart with specific time range (eg. last 24 hours) and granularity of 1m:
```
/candles eth-eur 24 15m
```
The granularity can only be one of `"1m" | "5m" | "15m" | "1h" | "6h" | "1d"`. \
The maximum number of candles requested from coinbase is limited to 300. \
The api request will fail for higher values.

![example](example.png)