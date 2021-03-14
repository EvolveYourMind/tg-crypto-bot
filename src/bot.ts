import Coinbase from "./coinbase";
import db, { Database } from "./db";
import telegram from "./telegram";
import config from "./config";
import crypto from "crypto";
import * as child_process from "child_process"
import * as fs from "fs";
import Binance from "./binance";

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

	private subscribeTarget(chat_id: number, product_id: string, target: number, parent_id?: string) {
		const id = crypto.randomBytes(4).toString("hex");
		const entry = { id: id, product_id, chat_id: chat_id, target_price: target, parent_id };
		db.update(x => ({ ...x, price_alert: [...x.price_alert, entry] }));
		this.subscribe(product_id);
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
				.filter(e => (lastPrice > e.target_price && e.target_price >= currentPrice)
					|| (lastPrice < e.target_price && e.target_price <= currentPrice))
				.forEach(e => {
					telegram.sendMessage(e.chat_id, `${product_id.toUpperCase()}: ${lastPrice} → ${currentPrice} ${currentPrice > lastPrice ? "📈" : "📉"}`);
					this.unsubscribeTarget(e.id);
					this.subscribeTarget(e.chat_id, e.product_id, e.target_price * (1 + 0.005), e.id);
					this.subscribeTarget(e.chat_id, e.product_id, e.target_price * (1 - 0.005), e.id);
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
			const [_, product_id, target] = command.split(" ");
			const entry = this.subscribeTarget(tgBody.message.chat.id, product_id, parseFloat(target));
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
						.map(x => `${x.product_id}: ${x.target_price.toFixed(4)} ${this.makeUnsubCommand(x)}`)
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

		}
	}
	private async screenshot(url: string): Promise<fs.ReadStream> {
		const TMP_PATH = ".tmp";
		const filepath = `${TMP_PATH}/${Date.now()}.png`;
		if(!fs.existsSync(TMP_PATH)) {
			fs.mkdirSync(TMP_PATH, { recursive: true });
		}
		const p = child_process.exec(`"/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome" ` + ["--headless", "--hide-scrollbars", "--no-sandbox", "--disable-gpu", "--window-size=1600,1100", `--screenshot=${filepath}`, `"${url}"`].join(" "));
		p.stderr?.on("data", d => console.error(d.toString()));
		p.stdout?.on("data", d => console.log(d.toString()));
		return new Promise((resolve) => p.stdout?.on("end", () => {
			// Optimistic resolve
			resolve(fs.createReadStream(filepath))
		}));
	}
}