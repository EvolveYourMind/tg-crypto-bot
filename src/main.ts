import app, { setHostUrl } from "./express";
import { setWebhook } from "./telegram";
import ngrok from "ngrok";
import config from "./config";
import Bot, { isBinanceProduct } from "./bot";
import Coinbase from "./coinbase";
import moment from "moment";
import { SaveToLog } from "./logger";
import Binance from "./binance";

const bot = new Bot();

app.post("/", (req, res) => {
	res.send("ok");
	const body: TGBody = req.body;
	if(body.message && body.message.text) {
		bot.handleCommand(body.message.text, body);
		SaveToLog(body);
	}
});

app.get("/candles/:id", (req, res) => {
	const product_id = req.params.id;
	const interval = req.query.interval ?? "1m";
	(isBinanceProduct(product_id)
		? Binance.instance.candles({
			product_id: req.params.id
			, interval: interval as any
		})
		: Coinbase.instance
			.candles({
				product_id: req.params.id
				, start: moment().subtract(parseFloat(req.query.hours as string ?? "2"), "hours").toISOString()
				, end: moment().toISOString()
				, granularity: { "1m": 60 as const, "5m": 300 as const, "15m": 900 as const, "1h": 3600 as const, "6h": 21600 as const, "1d": 86400 as const }[interval as "1m" | "5m" | "15m" | "1h" | "6h" | "1d"]
			}))
		.then(data => isBinanceProduct(product_id) ? data.map(x => ({ ...x, time: x.time / 1000 })) : data)
		.then(async data => {
			data.sort((a, b) => a.time - b.time);
			const High = data.reduce((a, v) => a.high > v.high ? a : v).high
			const Low = data.reduce((a, v) => a.low < v.low ? a : v).low
			const Open = data[0].open;
			const Close = data.slice(-1)[0].close;

			res.type('html').send(`
				<html>
					<head>
						<script type="text/javascript" src="https://unpkg.com/lightweight-charts/dist/lightweight-charts.standalone.production.js"></script>
					</head>
					<body style="width: 100vw; height: 100vh; margin: 0px; position: relative; font-family: arial">
						<div style="position:absolute; z-index: 2; width: 100%">
							<h3 style="text-align: center; margin-top: 20px;">${req.params.id.toUpperCase()}</h3>
							<table style="background-color: #e8e5e588; padding: 10px; border-radius: 10px; margin-left: auto; margin-right: auto">
								<tr>
									<td>High:</td><td>${High.toFixed(4)}</td>
									<td>Close:</td><td>${Close.toFixed(4)}</td>
								</tr>
								<tr>
									<td>Low:</td><td>${Low.toFixed(4)}</td>
									<td>Open:</td><td>${Open.toFixed(4)}</td>
								</tr>
								<tr>
									<td>High/Close:</td>
									<td style="color: ${High < Close ? "#68BA42" : "#D86A45"}">${(High / Close * 100 - 100).toFixed(4)}%</td>
								</tr>
								<tr>
									<td>Close/Open:</td>
									<td style="color: ${Close > Open ? "#68BA42" : "#D86A45"}">${(Close / Open * 100 - 100).toFixed(4)}%</td>
								</tr>
							</table>
						</div>
						<div id="chart_div"></div>
					</body>
					<script type="text/javascript">
						var chart = LightweightCharts.createChart(document.getElementById("chart_div"), {
							width: document.body.offsetWidth,
							height: document.body.offsetHeight,
							crosshair: {
								mode: LightweightCharts.CrosshairMode.Normal,
							},
							timeScale: {
								borderColor: 'rgba(197, 203, 206, 0.8)',
								timeVisible: true,
								fitContent: true
							},
						});
						var candleSeries = chart.addCandlestickSeries({
							upColor: '#68BA42',
							downColor: 'red',
							borderDownColor: 'red',
							borderUpColor: '#68BA42',
							wickDownColor: 'red',
							wickUpColor: '#68BA42',
							priceFormat: {
								precision: ${Close > 100 ? 2 : 4},
								minMove: ${Close > 100 ? 0.01 : 0.0001}
							},
						});
						
						candleSeries.setData(JSON.parse(\`${JSON.stringify(data)}\`));

						chart.timeScale().fitContent()
						var lineWidth = 1;
						${[0.02, 0.015, 0.01, 0.005,
					-0.02, -0.015, -0.01, -0.005
				].map(x => `
							 candleSeries.createPriceLine({
								price: ${Close * (1 + x)},
								color: '#ffe100',
								lineWidth: lineWidth,
								lineStyle: LightweightCharts.LineStyle.Solid,
								axisLabelVisible: true,
								title: '${(x > 0 ? "+" : "") + (x * 100).toFixed(1)}%',
							});
						`).join("\n")}
						</script>
				</html>
				`);
		});
});

async function main() {
	try {
		const tunnelUrl = config.WEBHOOK_URL ?? await ngrok.connect({ authtoken: config.NGROK_AUTH_TOKEN, addr: config.PORT });
		await setWebhook(tunnelUrl);
		setHostUrl(tunnelUrl);
		console.log("HTTPS Tunnel: ", tunnelUrl);
	} catch(err) {
		console.error("FATAL ERROR: ", err);
		await ngrok.disconnect().catch(console.error);
		console.log("Rebooting in 5 sec. Probably you should restart");
		setTimeout(main, 5000);
	}
}
main();