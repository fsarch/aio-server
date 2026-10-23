import "reflect-metadata";
import { FsArchAppBuilder } from "@fsarch/server";
import { Logger, Module } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { WsAdapter } from "@nestjs/platform-ws";
import { getMainPort, loadAioServerConfig } from "./config.js";
import { listenForMount } from "./port-routing.js";
import { SERVICE_TYPES } from "./service-registry.js";

// No service-specific logic lives in this process's own root module - every
// route/entity/guard comes from a mounted service's own descriptor via
// .addService() below. An empty module is all FsArchAppBuilder needs as its
// `baseModule` when nothing is registered outside of mounted services.
@Module({})
class AppModule {}

async function bootstrap() {
	const config = loadAioServerConfig();

	const builder = new FsArchAppBuilder(AppModule, {
		name: "AIO-Server",
		version: "1.0.0",
	});

	for (const service of config.services) {
		const descriptor = SERVICE_TYPES[service.type];
		if (!descriptor) {
			throw new Error(
				`Unknown service type "${service.type}" for service id "${service.id}". Known types: ${Object.keys(SERVICE_TYPES).join(", ")}`,
			);
		}

		builder.addService({ id: service.id, ...descriptor });
	}

	const app = await builder.build();

	// The body parser is app-wide, so it has to fit the most demanding
	// mounted service: dblight-server accepts record payloads of up to 2mb
	// (Express' default is 100kb). Must run before `listen()`, which would
	// otherwise register the default parser.
	(app as NestExpressApplication).useBodyParser("json", { limit: "2mb" });

	// Mounted services' `@WebSocketGateway({ path })`s (frontier-api's worker
	// control plane) share the main HTTP server, each under its mount prefix
	// (`/<id>/api/workers/websocket`, see `@fsarch/server`'s
	// `prefixGatewayProvider()`); upgrades on a mount's own port are rewritten
	// onto that same path by `listenForMount()`. Like the body parser, this
	// has to be set before `listen()` initializes the gateways.
	app.useWebSocketAdapter(new WsAdapter(app));

	await app.listen(getMainPort());

	// Services with their own `port` are additionally reachable there without
	// the `/<id>` prefix - same app, just rewritten onto the mount's routes.
	const logger = new Logger("AioServer");
	for (const service of config.services) {
		if (service.port === undefined) {
			continue;
		}
		await listenForMount({
			port: service.port,
			mountId: service.id,
			handler: app.getHttpAdapter().getInstance(),
			mainServer: app.getHttpServer(),
		});
		logger.log(
			`service "${service.id}" also listening on port ${service.port}`,
		);
	}
}

bootstrap();
