import WebSocket from "ws";
import config from "./config";
import crypto from "crypto";
import fetch from "node-fetch";

export default class Binance {
  public static readonly instance = new Binance();

  private ws: WebSocket;
  private priceSubs: Map<string, (price: number) => void>;
  private initializing: Promise<any>;

  public subscribePrice(product_id: string, onPrice: (price: number) => void) {
    const dcase = product_id.toLowerCase();
    if(!this.priceSubs.has(dcase)) {
      this.priceSubs.set(dcase, onPrice);
      this.subscribe(dcase);
    }
  }
  private async subscribe(product_id: string) {
    await this.initializing;
    console.log("Subscribing for", product_id);
    this.ws.send(JSON.stringify({
      "method": "SUBSCRIBE",
      "params":
        [
          `${product_id}@trade`,
        ],
      "id": Date.now()
    }));
  }

  private constructor() {
    this.ws = new WebSocket("wss://stream.binance.com:9443/ws/stream")
    this.initializing = new Promise(resolve => { });
    this.priceSubs = new Map();
    this.init();
  }

  private init() {
    let resolveInitializing: (v: any) => void;
    this.initializing = new Promise(r => resolveInitializing = r);
    this.ws = new WebSocket("wss://stream.binance.com:9443/ws/stream")
    this.ws.on("open", () => {
      resolveInitializing({});
      console.log("Connection with binance enstablished successfully");
    });
    this.ws.on("close", () => {
      console.log("Coinbase websocket got closed");
      this.init();
      [...this.priceSubs.keys()].forEach(k => this.subscribe(k));
    });
    this.listen();
  }

  private listen() {
    const parent = this;
    let lastLog = Date.now();
    this.ws.on("message", (data) => {
      const parsed = JSON.parse(data.toString());
      if(Date.now() > lastLog + 30000) {
        console.log("Got binance message.", parsed);
        lastLog = Date.now();
      }
      if("product_id" in parsed) {
        parent.priceSubs.get(parsed.product_id)?.(parseFloat(parsed.price));
      }
    });
  }
  public ticker(product_id: string): Promise<{
    symbol: string
    price: string
  }> {
    return get(`/ticker/price?symbol=${product_id}`).then(res => res.json());
  }
  public candles(opts: {
    product_id: string
    interval: "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d" | "3d" | "1w" | "1M"
  }): Promise<{ time: number, low: number, high: number, open: number, close: number, volume: number }[]> {
    return get(`/klines?symbol=${opts.product_id}&interval=${opts.interval}`)
      .then(res => res.json())
      .then(data => data.map(([time, open, high, low, close, volume]: [number, ...string[]]) => ({
        time: time
        , low: parseFloat(low)
        , high: parseFloat(high)
        , open: parseFloat(open)
        , close: parseFloat(close)
        , volume: parseFloat(volume)
      }))
      );
  }
}

function get(endpoint: string) {
  return fetch(`https://api.pro.binance.com/api/v3${endpoint}`, { method: "GET" });
}