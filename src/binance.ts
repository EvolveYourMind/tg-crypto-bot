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
    const upcase = product_id.toUpperCase();
    if(!this.priceSubs.has(upcase)) {
      this.priceSubs.set(upcase, onPrice);
      this.subscribe(upcase);
    }
  }
  private async subscribe(product_id: string) {
    await this.initializing;
    console.log("Subscribing for", product_id);
    this.ws.send(JSON.stringify({
      "method": "SUBSCRIBE",
      "params":
        [
          `${product_id.toLowerCase()}@trade`,
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
    const that = this;
    this.ws.on("close", () => {
      console.log("Binance websocket got closed... Reconnecting");
      setTimeout(() => {
        that.init();
        [...that.priceSubs.keys()].forEach(k => that.subscribe(k));
      }, 1000);
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
      } else if("s" in parsed) {
        parent.priceSubs.get(parsed.s)?.(parseFloat(parsed.p));
      }

    });
  }
  public ticker(product_id: string): Promise<{
    symbol: string
    price: string
  }> {
    return get(`/ticker/price?symbol=${product_id.toUpperCase()}`).then(res => res.json());
  }
  public candles(opts: {
    product_id: string
    interval: "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d" | "3d" | "1w" | "1M"
  }): Promise<{ time: number, low: number, high: number, open: number, close: number, volume: number }[]> {
    return get(`/klines?symbol=${opts.product_id.toUpperCase()}&interval=${opts.interval}`)
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
  return fetch(`https://api.binance.com/api/v3${endpoint}`, { method: "GET" });
}
