import WebSocket from "ws";
import fetch from "node-fetch";

export class Queuer {
  private queue: (() => Promise<void>)[] = [];
  private running: boolean = false;
  public run(f: () => Promise<void>) {
    const that = this;
    if(!that.running) {
      that.running = true;
      this.queue.push(f);
      f().finally(async () => {
        while(that.queue.length > 0) {
          await that.queue.shift()?.();
        }
        that.running = false;
      });
    } else {
      that.queue.push(f);
    }
  }
  public destroy() {
    this.queue = [];
  }
}
class Binance {
  private ws: WebSocket | null;
  private priceSubs: Map<string, (price: number) => void>;
  private lock: Queuer;
  public constructor() {
    this.ws = null;
    this.lock = new Queuer();
    this.priceSubs = new Map();
    this.connect();
  }

  public subscribePrice(product_id: string, onPrice: (price: number) => void) {
    const upcase = product_id.toUpperCase();
    if(!this.priceSubs.has(upcase)) {
      this.priceSubs.set(upcase, onPrice);
      this.subscribe(upcase);
    }
  }
  private async subscribe(product_id: string) {
    this.lock.run(async () => {
      try {
        console.log("Subscribing for", product_id);
        this.ws?.send(JSON.stringify({
          "method": "SUBSCRIBE",
          "params":
            [
              `${product_id.toLowerCase()}@trade`,
            ],
          "id": Date.now()
        }));
      } catch(err) {
        console.error("Error while subscribing on binance for " + product_id, err);
      }
      await new Promise(r => setTimeout(r, 2000));
    });
  }


  private connect() {
    const that = this;
    this.lock.run(() => new Promise(resolve => {
      that.ws = new WebSocket("wss://stream.binance.com:9443/ws");
      const interval = setInterval(() => that.ws?.pong(), 60000);
      that.ws.on("open", () => {
        console.log("Connection with binance enstablished successfully");
        that.listen();
        resolve();
      });
      that.ws.on("close", () => {
        clearInterval(interval);
        console.log("Binance websocket got closed... Reconnecting");
        setTimeout(() => {
          that.lock.destroy();
          that.connect();
          [...that.priceSubs.keys()].forEach(k => that.subscribe(k));
        }, 1000);
      });
    }));
  }

  private listen() {
    const parent = this;
    let lastLog = Date.now();
    this.ws?.on("message", (data) => {
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

export default {
  instance: new Binance()
};
