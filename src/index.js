import Redis from "ioredis";
import { customAlphabet } from "nanoid";
import { v4 as uuidv4 } from "uuid";

function generatePIN(length = 6) {
	return customAlphabet("123456789", length)();
}

export class MemoryStore {
	constructor(options = {}) {
		this.options = Object.assign({ ttl: 5 * 60, prefix: "" }, options);
		this.store = new Map();
	}

	async get(key) {
		const data = await this.store.get(`${this.options.prefix}${key}`);
		return data != null ? data : null;
	}

	async set(key, data, ttl = this.options.ttl) {
		await this.store.set(`${this.options.prefix}${key}`, data);
		if (ttl > 0) {
			setTimeout(() => {
				this.store.delete(`${this.options.prefix}${key}`);
			}, ttl * 1000);
		}
		return this;
	}
}

export class RedisStore {
	constructor(options = {}) {
		this.options = Object.assign(
			{
				redis: { host: "127.0.0.1", port: 6379 },
				ttl: 5 * 60,
				prefix: "",
			},
			options,
		);
		this.store = new Redis(this.options.redis);
		this.serialize = this.options.serialize || JSON.stringify;
		this.deserialize = this.options.deserialize || JSON.parse;
	}

	async get(key) {
		const serialized = await this.store.get(`${this.options.prefix}${key}`);
		return serialized != null ? this.deserialize(serialized) : null;
	}

	async set(key, data, ttl = this.options.ttl) {
		const serialized = this.serialize(data);
		const ttlOption = ttl ? ["ex", ttl] : [];
		await this.store.set(`${this.options.prefix}${key}`, serialized, ...ttlOption);
		return this;
	}
}

export class Identifier {
	constructor(options = {}) {
		this.options = Object.assign(
			{
				codeGenerator: generatePIN,
				requestIdGenerator: uuidv4,
			},
			options,
		);
		this.store = this.options.store || new MemoryStore();
		this.codeGenerator = this.options.codeGenerator;
		this.requestIdGenerator = this.options.requestIdGenerator;
	}

	async request(extra = {}, options = {}) {
		const now = new Date();
		const ttl = options.ttl || this.store.options.ttl;
		const data = {
			requestId: this.requestIdGenerator(),
			code: this.codeGenerator(),
			createdAt: now,
			ttl,
		};
		const { requestId } = data;
		await this.store.set(requestId, { ...extra, ...data }, ttl);
		return data;
	}

	async verify(requestId, code) {
		const data = await this.store.get(requestId);
		if (!data || data.code !== code) {
			return null;
		}
		return data;
	}

	async check(requestId) {
		const data = await this.store.get(requestId);
		return data;
	}
}
