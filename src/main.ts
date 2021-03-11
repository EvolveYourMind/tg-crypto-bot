import app, { setHostUrl } from "./express";
import { setWebhook } from "./telegram";
import ngrok from "ngrok";
import config from "./config";
import Bot from "./bot";
import Coinbase from "./coinbase";
import moment from "moment";
import { SaveToLog } from "./logger";

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
	Coinbase.instance.candles({
		product_id: req.params.id
		, start: moment().subtract(parseFloat(req.query.hours as string ?? "2"), "hours").toISOString()
		, end: moment().toISOString()
		, granularity: parseInt(req.query.granularity as any ?? "60") as any
	})
		.then(async data => {
			data.sort((a, b) => a.time - b.time);
			const High = data.reduce((a, v) => a.high > v.high ? a : v).high
			const Low = data.reduce((a, v) => a.low < v.low ? a : v).low
			const Open = data[0].open;
			const Close = data.slice(-1)[0].close;
			console.log(data[0].time);
			res.type('html').send(`
				<html>
					<head>
						<script type="text/javascript" src="https://unpkg.com/lightweight-charts/dist/lightweight-charts.standalone.production.js"></script>
					</head>
					<body style="width: 100vw; height: 100vh; margin: 0px; position: relative; font-family: arial">
						<div style="position:absolute; z-index: 2; color:#fff; width: 100%">
							<h3 style="text-align: center; margin-top: 40px;">${req.params.id.toUpperCase()}</h3>
							<table style="color: #fff; margin-left: auto; margin-right: auto">
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
									<td style="color: ${High > Close ? "#68BA42" : "#D86A45"}">${(High / Close * 100 - 100).toFixed(4)}%</td>
								</tr>
								<tr>
									<td>Close/Open:</td>
									<td style="color: ${Close > Open ? "#68BA42" : "#D86A45"}">${(Close / Open * 100 - 100).toFixed(4)}%</td>
								</tr>
								<tr>
									<td>Date</td>
									<td>${new Date(data[0].time * 1000).toLocaleString()}</td>
								</tr>
							</table>
						</div>
						<div id="chart_div"></div>
					</body>
					<script type="text/javascript">
						var chart = LightweightCharts.createChart(document.getElementById("chart_div"), {
							width: document.body.offsetWidth,
							height: document.body.offsetHeight,
							layout: {
								backgroundColor: '#000000',
								textColor: 'rgba(255, 255, 255, 0.9)',
							},
							grid: {
								vertLines: {
									color: 'rgba(197, 203, 206, 0.5)',
								},
								horzLines: {
									color: 'rgba(197, 203, 206, 0.5)',
								},
							},
							crosshair: {
								mode: LightweightCharts.CrosshairMode.Normal,
							},
							rightPriceScale: {
								borderColor: 'rgba(197, 203, 206, 0.8)',
							},
							timeScale: {
								borderColor: 'rgba(197, 203, 206, 0.8)',
								timeVisible: true,
							},
						});
						
						var candleSeries = chart.addCandlestickSeries({
							upColor: '#68BA42',
							downColor: 'red',
							borderDownColor: 'red',
							borderUpColor: '#68BA42',
							wickDownColor: 'red',
							wickUpColor: '#68BA42',
						});
						
						candleSeries.setData(JSON.parse(\`${JSON.stringify(data)}\`));
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