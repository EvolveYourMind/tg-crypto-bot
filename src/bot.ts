import Coinbase from "./coinbase";
import db, { Database } from "./db";
import telegram from "./telegram";

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

	private onPrice(product_id: string, price: number) {
		db.read().price_alert.forEach(e => {
			if(product_id in this.lastPrices) {
				const lastPrice = this.lastPrices[product_id];
				if(lastPrice >= e.target_price && e.target_price >= price
					|| lastPrice <= e.target_price && e.target_price <= price) {
					telegram.sendMessage(e.chat_id, `Price for ${product_id} has just passed from ${lastPrice} to ${price}.\n\n${this.makeUnsubCommand(e)}`);
				}
			}
			this.lastPrices[product_id] = price;
		});
	}

	public handleCommand(command: string, tgBody: TGBody) {
		if(command.startsWith("/unsub")) {
			const [_, id] = command.split("_");
			db.update(x => ({
				...x
				, price_alert: x.price_alert.filter(y => y.id !== id)
			}));
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
			telegram.sendMessage(
				tgBody.message.chat.id
				, `Your subscriptions:\n\n${db.read()
					.price_alert
					.filter(x => x.chat_id === tgBody.message.chat.id)
					.map(x => `Subscription for ${x.product_id} target ${x.target_price}:\n${this.makeUnsubCommand(x)}`)
					.join("\n\n")
				}`)
		} else if(command.startsWith("/ticker")) {
			const [_, product_id] = command.split(" ");
			Coinbase.instance.ticker(product_id)
				.then(res => telegram.sendMessage(
					tgBody.message.chat.id
					, `Last trade:\n${(["price", "size", "ask", "bid"] as (keyof typeof res)[]).map(k => `${k}: ${res[k]}`).join("\n")
					}`
				)
				).catch(console.error);
		}
	}

}