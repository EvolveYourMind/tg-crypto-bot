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
			console.log("Connection with coinbase enstablished successfully");
		});
		this.ws.on("close", () => {
			console.log("Coinbase websocket got closed");
		});
		this.priceSubs = new Map();
		this.listen();
	}

	private listen() {
		const parent = this;
		let lastLog = Date.now();
		this.ws.on("message", (data) => {
			const parsed = JSON.parse(data.toString());
			if(Date.now() > lastLog + 30000) {
				console.log("Got coinbase message.", parsed);
				lastLog = Date.now();
			}
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
	public trades(product_id: string): Promise<{
		time: string,
		trade_id: number,
		price: string,
		size: string,
		side: "buy" | "sell"
	}[]> {
		return get(`/products/${product_id}/trades`).then(res => res.json());
	}
	public candles(opts: {
		product_id: string
		// start	Start time in ISO 8601
		start: string
		// end	End time in ISO 8601
		end: string
		// granularity	Desired timeslice in seconds
		granularity: 60 | 300 | 900 | 3600 | 21600 | 86400
	}): Promise<{ time: number, low: number, high: number, open: number, close: number, volume: number }[]> {
		return get(`/products/${opts.product_id}/candles?start=${opts.start}&end=${opts.end}&granularity=${opts.granularity}`)
			.then(res => res.json())
			.then(data => data.map((x: [number, number, number, number, number, number]) => ({
				time: x[0]
				, low: x[1]
				, high: x[2]
				, open: x[3]
				, close: x[4]
				, volume: x[5]
			}))
			);
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