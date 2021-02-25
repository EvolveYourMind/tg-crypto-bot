import app, { setHostUrl } from "./express";
import { setWebhook } from "./telegram";
import ngrok from "ngrok";
import config from "./config";
import Bot from "./bot";
import Coinbase from "./coinbase";
import moment from "moment";

const bot = new Bot();

app.post("/", (req, res) => {
	res.send("ok");
	const body: TGBody = req.body;
	if(body.message && body.message.text) {
		bot.handleCommand(body.message.text, body);
	}
});

app.get("/candles/:id", (req, res) => {
	Coinbase.instance.candles({
		product_id: req.params.id
		, start: moment().subtract(parseFloat(req.query.hours as string), "hours").toISOString()
		, end: moment().toISOString()
		, granularity: parseInt(req.query.granularity as any) as any
	})
		.then(async data => {
			data.sort((a, b) => a.time - b.time);
			const chartInfo = data.map(x => ([moment.unix(x.time).format("LT"), x.low, x.open, x.close, x.high]
			));
			res.type('html').send(`
				<html>
					<head>
						<script type="text/javascript" src="https://www.gstatic.com/charts/loader.js"></script>
						<script type="text/javascript">
							google.charts.load('current', {'packages':['corechart']});
							google.charts.setOnLoadCallback(drawChart);
							function drawChart() {
								var data = google.visualization.arrayToDataTable(JSON.parse(\`${JSON.stringify(chartInfo)}\`), true);
								var options = {	legend:'none'	};
								var chart = new google.visualization.CandlestickChart(document.getElementById('chart_div'));
								chart.draw(data, options);
							}
						</script>
					</head>
					<body style="width: 100vw; height: 100vh; padding: 0px">
						<div id="chart_div" style="width: 100vw; height: 100vh;"></div>
					</body>
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