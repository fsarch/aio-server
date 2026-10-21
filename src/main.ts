import "reflect-metadata";
import { FsArchAppBuilder } from "@fsarch/server";
import { Module } from "@nestjs/common";
import { loadAioServerConfig } from "./config.js";
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

  await app.listen(process.env.PORT ?? 8080);
}

bootstrap();
