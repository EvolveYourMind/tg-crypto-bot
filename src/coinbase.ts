import WebSocket from "ws";

export default class Coinbase {
	public static readonly instance = new Coinbase();

	private ws: WebSocket;
	private priceSubs: Map<string, (price: number) => void>;
	private initializing: Promise<any>;

	public async subscribePrice(product_id: string, onPrice: (price: number) => void) {
		await this.initializing;
		if(!this.priceSubs.has(product_id)) {
			this.priceSubs.set(product_id, onPrice);
			this.ws.send(JSON.stringify({
				"type": "subscribe"
				, "product_ids": [product_id]
				, "channels": ["ticker"]
			}));
		}
	}

	private constructor() {
		this.ws = new WebSocket("wss://ws-feed.pro.coinbase.com");
		let resolveInitializing: (v: any) => void;
		this.initializing = new Promise(r => resolveInitializing = r);
		this.ws.on("open", () => {
			resolveInitializing({});
			console.log("Connection with coinbase enstablished successfully")
		});
		this.priceSubs = new Map();
		this.listen();
	}

	private listen() {
		const parent = this;
		this.ws.on("message", (data) => {
			const parsed = JSON.parse(data.toString());
			if("product_id" in parsed) {
				parent.priceSubs.get(parsed.product_id)?.(parseFloat(parsed.price));
			}
		});
	}
}
