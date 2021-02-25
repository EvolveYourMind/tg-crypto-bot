import moment from "moment";
import Coinbase from "./coinbase";
import db, { Database } from "./db";
import telegram from "./telegram";
import puppeteer from "puppeteer";
import { Stream } from "form-data";

export default class Bot {
	private lastPrices: Record<string, number>;
	constructor() {
		this.lastPrices = {};
		new Set(db.read().price_alert.map(x => x.product_id)).forEach(product_id => this.subscribe(product_id));
	}

	private makeUnsubCommand(e: Database["price_alert"][0]) {
		return `To unsubscribe:\n/unsub_${e.id}`;
	}

	private subscribe(product_id: string) {
		Coinbase.instance.subscribePrice(product_id, (price) => this.onPrice(product_id, price));
	}

	private onPrice(product_id: string, currentPrice: number) {
		const lastPrice = this.lastPrices[product_id];
		if(lastPrice !== undefined && lastPrice !== null) {
			db.read().price_alert
				.filter(e => (lastPrice > e.target_price && e.target_price >= currentPrice)
					|| (lastPrice < e.target_price && e.target_price <= currentPrice))
				.forEach(e => {
					telegram.sendMessage(e.chat_id, `Price for ${product_id} has just passed from ${lastPrice} to ${currentPrice}.\n\n${this.makeUnsubCommand(e)}`);
				});
		}
		this.lastPrices[product_id] = currentPrice;
	}

	public handleCommand(command: string, tgBody: TGBody) {
		if(command.startsWith("/unsub")) {
			const [_, id] = command.split("_");
			if(id === "all") {
				db.update(x => ({ ...x, price_alert: x.price_alert.filter(y => y.chat_id !== tgBody.message.chat.id) }))
			} else {
				db.update(x => ({ ...x, price_alert: x.price_alert.filter(y => y.id !== id) }));
			}
			telegram.sendMessage(tgBody.message.chat.id, "OK.");
		} else if(command.startsWith("/target")) {
			const [_, product_id, target] = command.split(" ");
			const id = Date.now().toString();
			const entry = { id: id, product_id, chat_id: tgBody.message.chat.id, target_price: parseFloat(target) };
			db.update(x => ({
				...x
				, price_alert: [...x.price_alert, entry]
			}));
			this.subscribe(product_id);
			telegram.sendMessage(tgBody.message.chat.id, `OK.\n${this.makeUnsubCommand(entry)}`);
		} else if(command.startsWith("/list")) {
			if(db.read().price_alert.filter(x => x.chat_id === tgBody.message.chat.id).length === 0) {
				telegram.sendMessage(tgBody.message.chat.id, "No active subscriptions");
			} else {
				telegram.sendMessage(
					tgBody.message.chat.id
					, `Your subscriptions:\n\n${db.read()
						.price_alert
						.filter(x => x.chat_id === tgBody.message.chat.id)
						.map(x => `Subscription for ${x.product_id} target ${x.target_price}:\n${this.makeUnsubCommand(x)}`)
						.join("\n\n")
					}\n\nTo unsubscribe all: /unsub_all`)
			}
		} else if(command.startsWith("/ticker")) {
			const [_, product_id] = command.split(" ");
			Coinbase.instance.ticker(product_id)
				.then(res => telegram.sendMessage(
					tgBody.message.chat.id
					, `Last trade:\n${(["price", "size", "ask", "bid"] as (keyof typeof res)[]).map(k => `${k}: ${res[k]}`).join("\n")
					}`
				)
				).catch(console.error);
		} else if(command.startsWith("/ping")) {
			telegram.sendMessage(tgBody.message.chat.id, encodeURI("Pong 🏓"));
		} else if(command.startsWith("/chart")) {
			const [_, product_id] = command.split(" ");
			Coinbase.instance.trades(product_id)
				.then(res => {
					res.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
					telegram.sendPhoto(
						tgBody.message.chat.id
						, [
							product_id
							, `First: ${moment(res.slice(-1)[0].time).format("LT")}`
							, `Last: ${moment(res[0].time).format("LT")}`
							, `Low: ${res.map(x => parseFloat(x.price)).reduce((a, v) => a < v ? a : v)}`
							, `High: ${res.map(x => parseFloat(x.price)).reduce((a, v) => a < v ? v : a)}`
						].join("\n")
						, `https://quickchart.io/chart?c=${encodeURI(JSON.stringify({
							type: 'line',
							data: {
								labels: res.map((__, i) => i),
								datasets: [{ label: 'trades', data: res.map(x => parseFloat(x.price)), fill: false, borderColor: 'black' }]
							},
							options: {
								scales: {
									yAxes: [{
										ticks: {
											beginAtZero: false
										}
									}]
								}
							}
						}))}`
					)
				}
				);
		} else if(command.startsWith("/candles")) {
			const [_, product_id] = command.split(" ");
			telegram.sendMessage(tgBody.message.chat.id, "Make a wish");
			Coinbase.instance.candles({
				product_id
				, start: moment().subtract(0.5, "hours").toISOString()
				, end: moment().toISOString()
				, granularity: 60
			})
				.then(async res => {
					res.sort((a, b) => a.time - b.time);
					const chartInfo = res.map(x => ([
						moment.unix(x.time).format("LT")
						, x.low
						, x.open
						, x.close
						, x.high
					]
					));
					const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
					const page = await browser.newPage();
					await page.setContent(`
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
					telegram.sendPhoto(tgBody.message.chat.id, product_id, await page.screenshot() as Buffer);
				}
				);
		}
	}

}