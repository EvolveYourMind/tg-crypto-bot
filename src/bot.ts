import Coinbase from "./coinbase";
import db, { Database } from "./db";
import telegram from "./telegram";
import config from "./config";
import crypto from "crypto";
import * as child_process from "child_process"
import * as fs from "fs";
import Binance from "./binance";
import moment from "moment";

export const isBinanceProduct = (product_id: string) => !product_id.includes("-");

export default class Bot {
	private lastPrices: Record<string, number>;
	constructor() {
		this.lastPrices = {};
		new Set(db.read().price_alert.map(x => x.product_id)).forEach(product_id => this.subscribe(product_id));
	}

	private makeUnsubCommand(e: Database["price_alert"][0]) {
		return `(/unsub_${e.id})`;
	}

	private subscribe(product_id: string) {
		if(isBinanceProduct(product_id)) {
			Binance.instance.subscribePrice(product_id, (price) => this.onPrice(product_id, price));
		} else {
			Coinbase.instance.subscribePrice(product_id, (price) => this.onPrice(product_id, price));
		}
	}

	private subscribeTarget(opts: {
		chat_id: number
		product_id: string
		target: number
		parent_id?: string
		move_perc?: number
		previous?: {
			price: number
			time: number
		}
	}) {
		const id = crypto.randomBytes(4).toString("hex");
		const entry: Database["price_alert"][0] = {
			id: id
			, product_id: opts.product_id
			, chat_id: opts.chat_id
			, target_price: opts.target
			, parent_id: opts.parent_id
			, previous: opts.previous
			, move_perc: opts.move_perc
		};
		db.update(x => ({ ...x, price_alert: [...x.price_alert, entry] }));
		this.subscribe(opts.product_id);
		return entry;
	}

	private unsubscribeTarget(id: string) {
		const found = db.read().price_alert.find(x => x.id === id);
		db.update(x => ({ ...x, price_alert: x.price_alert.filter(y => y.id !== id && (y.parent_id === undefined || y.parent_id !== found?.parent_id)) }));
	}

	private unsubscribeTargetAll(chatId: number) {
		db.update(x => ({ ...x, price_alert: x.price_alert.filter(y => y.chat_id !== chatId) }))
	}

	private onPrice(product_id: string, currentPrice: number) {
		const lastPrice = this.lastPrices[product_id];
		if(lastPrice !== undefined && lastPrice !== null) {
			db.read()
				.price_alert
				.filter(e => e.product_id === product_id
					&&
					((lastPrice > e.target_price && e.target_price >= currentPrice)
						|| (lastPrice < e.target_price && e.target_price <= currentPrice))
				)
				.forEach(e => {
					const prev = e.previous?.price ?? lastPrice;
					telegram.sendMessage(e.chat_id, `${currentPrice > prev ? "🟢" : "🔵"} ${product_id.toUpperCase()}: ${prev} → ${currentPrice} ${currentPrice > prev ? "📈" : "📉"} ${((currentPrice / prev - 1) * 100).toFixed(2)}%`);
					this.unsubscribeTarget(e.id);
					const move_perc = e.move_perc ?? 0.005;
					this.subscribeTarget({
						chat_id: e.chat_id
						, product_id: e.product_id
						, target: e.target_price * (1 + move_perc)
						, parent_id: e.id
						, move_perc
						, previous: {
							price: currentPrice
							, time: Date.now()
						}
					});
					this.subscribeTarget({
						chat_id: e.chat_id
						, product_id: e.product_id
						, target: e.target_price * (1 - move_perc)
						, parent_id: e.id
						, move_perc
						, previous: {
							price: currentPrice
							, time: Date.now()
						}
					});
				});
		}
		this.lastPrices[product_id] = currentPrice;
	}

	public handleCommand(command: string, tgBody: TGBody) {
		if(command.startsWith("/unsub")) {
			const [_, id] = command.split("_");
			if(id === "all") {
				this.unsubscribeTargetAll(tgBody.message.chat.id);
			} else {
				this.unsubscribeTarget(id);
			}
			telegram.sendMessage(tgBody.message.chat.id, "OK.");
		} else if(command.startsWith("/target")) {
			const [_, product_id, target, move_perc] = command.split(" ");
			const entry = this.subscribeTarget({
				chat_id: tgBody.message.chat.id
				, product_id
				, target: parseFloat(target)
				, move_perc: move_perc ? parseFloat(move_perc) : undefined
			});
			telegram.sendMessage(tgBody.message.chat.id, `OK. ${this.makeUnsubCommand(entry)}`);
		} else if(command.startsWith("/list")) {
			if(db.read().price_alert.filter(x => x.chat_id === tgBody.message.chat.id).length === 0) {
				telegram.sendMessage(tgBody.message.chat.id, "No active subscriptions");
			} else {
				telegram.sendMessage(
					tgBody.message.chat.id
					, `Your subscriptions:\n\n${db.read()
						.price_alert
						.filter(x => x.chat_id === tgBody.message.chat.id)
						.map(x => `${x.product_id}: ${(x.target_price ?? 0).toFixed(4)} ${this.makeUnsubCommand(x)}`)
						.join("\n")
					}\nUnsubscribe all: /unsub_all`)
			}
		} else if(command.startsWith("/ticker")) {
			const [_, product_id] = command.split(" ");
			if(isBinanceProduct(product_id)) {
				Binance.instance.ticker(product_id)
					.then(res => telegram.sendMessage(
						tgBody.message.chat.id
						, `Last trade:\n${(["symbol", "price"] as (keyof typeof res)[]).map(k => `${k}: ${res[k]}`).join("\n")
						}`
					)
					).catch(console.error);
			} else {
				Coinbase.instance.ticker(product_id)
					.then(res => telegram.sendMessage(
						tgBody.message.chat.id
						, `Last trade:\n${(["price", "size", "ask", "bid"] as (keyof typeof res)[]).map(k => `${k}: ${res[k]}`).join("\n")
						}`
					)
					).catch(console.error);
			}
		} else if(command.startsWith("/ping")) {
			telegram.sendMessage(tgBody.message.chat.id, "Pong 🏓");
		} else if(command.startsWith("/candles")) {
			const [_, product_id, hrs, intrvl] = command.split(" ");
			const hours = hrs || 2;
			const interval = intrvl || "1m";
			const url = `http://localhost:${config.PORT}/candles/${product_id}?hours=${hours}&interval=${interval}`;
			this.screenshot(url)
				.then(buf => telegram.sendPhoto(tgBody.message.chat.id, product_id, buf))
				.then(res => res.json())
				.then(console.log)
				.catch(console.error);

		} else if(command.startsWith("/help") || command.startsWith("/start")) {
			telegram.sendMessage(tgBody.message.chat.id, `
Available commands:

Ping:
/ping

Get the last trade for btc-usdt pair: 
/ticker btcusdt

Subscribe to get a notification when a price surpasses a certain target. Once reached, two new targets will be created to +-0.5%:
/target btc-eur 35000

Change the moving target percentage to 1%:
/target btc-eur 35000 0.01

List active subscriptions:
/list

Unsubscribe from all subscriptions:
/unsub_all

Unsubscribe from a specific subscription (id: 1614845638872):
/unsub_1614845638872

Get a candles chart of the market for the last 2 hours with a granularity of 1 minute:
/candles btc-eur

Get candles chart with specific time range (eg. last 24 hours) and granularity of 1m:

/candles eth-eur 24 15m
The granularity can only be one of "1m" | "5m" | "15m" | "1h" | "6h" | "1d".
The maximum number of candles requested from coinbase is limited to 300.
The api request will fail for higher values.
`)
		}
	}
	private async screenshot(url: string): Promise<fs.ReadStream> {
		const TMP_PATH = ".tmp";
		const filepath = `${TMP_PATH}/${Date.now()}.png`;
		if(!fs.existsSync(TMP_PATH)) {
			fs.mkdirSync(TMP_PATH, { recursive: true });
		}
		const p = child_process.exec(`chromium-browser ` + ["--headless", "--hide-scrollbars", "--no-sandbox", "--disable-gpu", "--window-size=1600,1100", `--screenshot=${filepath}`, `"${url}"`].join(" "));
		p.stderr?.on("data", d => console.error(d.toString()));
		p.stdout?.on("data", d => console.log(d.toString()));
		return new Promise((resolve) => p.stdout?.on("end", () => {
			// Optimistic resolve
			resolve(fs.createReadStream(filepath))
		}));
	}
}