import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { listenForMount, rewriteToMount } from "./port-routing.js";

describe("rewriteToMount", () => {
	it("puts the mount id after a leading URI version segment", () => {
		expect(rewriteToMount("/v1/parts", "mt")).toBe("/v1/mt/parts");
		expect(rewriteToMount("/v1/parts/1/materials", "mt")).toBe(
			"/v1/mt/parts/1/materials",
		);
	});

	it("prefixes unversioned paths", () => {
		expect(rewriteToMount("/.ai/mcp", "mt")).toBe("/mt/.ai/mcp");
		expect(rewriteToMount("/metric-types", "metric")).toBe(
			"/metric/metric-types",
		);
		expect(rewriteToMount("/", "mt")).toBe("/mt");
	});

	it("keeps query strings and fragments", () => {
		expect(rewriteToMount("/v1/parts?search=a%2Fb&page=2", "mt")).toBe(
			"/v1/mt/parts?search=a%2Fb&page=2",
		);
		expect(rewriteToMount("/?x=1", "mt")).toBe("/mt?x=1");
	});

	it("leaves URLs that already point at the mount unchanged", () => {
		expect(rewriteToMount("/v1/mt/parts", "mt")).toBe("/v1/mt/parts");
		expect(rewriteToMount("/mt/.ai/mcp", "mt")).toBe("/mt/.ai/mcp");
		expect(rewriteToMount("/mt", "mt")).toBe("/mt");
		expect(rewriteToMount("/v1/mt?x=1", "mt")).toBe("/v1/mt?x=1");
	});

	it("doesn't mistake a route that merely starts with the id for the mount", () => {
		expect(rewriteToMount("/v1/mt-other", "mt")).toBe("/v1/mt/mt-other");
		expect(rewriteToMount("/mtx", "mt")).toBe("/mt/mtx");
	});
});

describe("listenForMount", () => {
	const servers: Array<Server> = [];

	afterEach(async () => {
		await Promise.all(
			servers
				.splice(0)
				.map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
		);
	});

	async function startMain() {
		const seen: Array<string> = [];
		const main = createServer((req, res) => {
			seen.push(req.url ?? "");
			res.end(req.url);
		});
		servers.push(main);
		await new Promise<void>((resolve) => main.listen(0, resolve));
		return { main, seen };
	}

	it("serves requests on the extra port through the main handler, rewritten onto the mount", async () => {
		const { main } = await startMain();
		const handler = main.listeners("request")[0] as Parameters<
			typeof listenForMount
		>[0]["handler"];
		const extra = await listenForMount({
			port: 0,
			mountId: "mt",
			handler,
			mainServer: main,
		});
		servers.push(extra);
		const { port } = extra.address() as AddressInfo;

		const body = await (
			await fetch(`http://127.0.0.1:${port}/v1/parts?search=x`)
		).text();
		expect(body).toBe("/v1/mt/parts?search=x");
	});

	it("re-emits rewritten WebSocket upgrades on the main server", async () => {
		const { main } = await startMain();
		const upgradedUrls: Array<string> = [];
		main.on("upgrade", (req, socket) => {
			upgradedUrls.push(req.url ?? "");
			socket.end(
				"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n",
			);
		});
		const extra = await listenForMount({
			port: 0,
			mountId: "frontier",
			handler: () => {},
			mainServer: main,
		});
		servers.push(extra);
		const { port } = extra.address() as AddressInfo;

		await new Promise<void>((resolve, reject) => {
			const req = request({
				port,
				path: "/ws",
				headers: { connection: "Upgrade", upgrade: "websocket" },
			});
			req.on("upgrade", (_res, socket) => {
				socket.destroy();
				resolve();
			});
			req.on("error", reject);
			req.end();
		});

		expect(upgradedUrls).toEqual(["/frontier/ws"]);
	});
});
