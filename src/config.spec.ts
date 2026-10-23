import { describe, expect, it } from "vitest";
import { validateAioServerConfig } from "./config.js";

const service = (id: string, port?: number) => ({
	id,
	type: "metric-server",
	...(port === undefined ? {} : { port }),
});

describe("validateAioServerConfig ports", () => {
	it("accepts services with and without their own port", () => {
		expect(() =>
			validateAioServerConfig(
				{ services: [service("a"), service("b", 8081), service("c", 8082)] },
				8080,
			),
		).not.toThrow();
	});

	it("rejects two services on the same port", () => {
		expect(() =>
			validateAioServerConfig(
				{ services: [service("a", 8081), service("b", 8081)] },
				8080,
			),
		).toThrow(/"a" and "b" both use port 8081/);
	});

	it("rejects a service on the main port", () => {
		expect(() =>
			validateAioServerConfig({ services: [service("a", 8080)] }, 8080),
		).toThrow(/main port/);
	});

	it("rejects invalid port values", () => {
		for (const port of [0, 70000, 80.5, "8081" as unknown as number]) {
			expect(() =>
				validateAioServerConfig({ services: [service("a", port)] }, 8080),
			).toThrow(/invalid port/);
		}
	});
});
