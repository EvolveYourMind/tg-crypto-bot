import WebSocket from "ws";
import config from "./config";
import crypto from "crypto";
import fetch from "node-fetch";

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
	public ticker(product_id: string): Promise<{
		trade_id: number,
		price: string,
		size: string,
		bid: string,
		ask: string,
		volume: string,
		time: string
	}> {
		return get(`/products/${product_id}/ticker`).then(res => res.json());
	}
}

function get(endpoint: string) {
	return fetch(`https://api.pro.coinbase.com${endpoint}`, {
		method: "GET"
		, headers: signedHeaders(endpoint, "GET", "")
	});
}
function post(endpoint: string, body: Object) {
	return fetch(`https://api.pro.coinbase.com${endpoint}`, {
		method: "POST"
		, headers: signedHeaders(endpoint, "POST", JSON.stringify(body))
	})
}

function signedHeaders(endpoint: string, method: "GET" | "POST", bodyStr: string) {
	const timestamp = Date.now() / 1000;
	const what = timestamp + method + endpoint + bodyStr;
	const key = Buffer.from(config.COINBASE_SECRET, "base64");
	return {
		"CB-ACCESS-SIGN": crypto.createHmac("sha256", key).update(what).digest("base64")
		, "CB-ACCESS-TIMESTAMP": String(timestamp)
		, "CB-ACCESS-PASSPHRASE": config.COINBASE_PASSPHRASE
		, "CB-ACCESS-KEY": config.COINBASE_KEY_NAME
	}
}