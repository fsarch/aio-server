import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as yaml from "js-yaml";

const YAML_CONFIG_FILENAME = "config.yaml";

/**
 * One entry of the harness's own `services` array - which service `type` to
 * mount under which `id` (route prefix / TypeORM connection name), with that
 * mount's own config section. This is read directly from disk, before
 * `NestFactory.create()` runs, because it decides *which* `.addService()`
 * calls to make in the first place - by the time Nest's own `ConfigService`
 * is available, the module graph is already fixed.
 *
 * `config` itself is forwarded unchanged to `@fsarch/server`'s
 * `ModuleConfigurationService`, which resolves `database`/`auth`/`uac`/...
 * from `services[].config` for this same `id` - so its shape is whatever
 * the mounted service type's standalone config section normally looks like.
 *
 * `port` optionally exposes this mount on a port of its own as well, as if
 * it were running standalone: requests there are rewritten onto the mount's
 * `/<id>` routes inside the one shared Nest app (see `port-routing.ts`), so
 * clients on that port don't need the prefix.
 */
export type AioServerServiceEntry = {
  id: string;
  type: string;
  port?: number;
  config?: Record<string, unknown>;
};

export type AioServerConfig = {
  services: Array<AioServerServiceEntry>;
};

export function loadAioServerConfig(): AioServerConfig {
  const config = yaml.load(
    readFileSync(
      resolve(
        process.cwd(),
        process.env.CONFIG_FILE_PATH || YAML_CONFIG_FILENAME,
      ),
      "utf8",
    ),
  ) as AioServerConfig;

  validateAioServerConfig(config, getMainPort());

  return config;
}

/** The port the Nest app itself listens on (all mounts, `/<id>`-prefixed). */
export function getMainPort(): number {
  return Number(process.env.PORT ?? 8080);
}

export function validateAioServerConfig(
  config: AioServerConfig,
  mainPort: number,
): void {
  if (!Array.isArray(config?.services) || config.services.length === 0) {
    throw new Error(
      `config must define a non-empty "services" array (checked ${process.env.CONFIG_FILE_PATH || YAML_CONFIG_FILENAME})`,
    );
  }

  const seenIds = new Set<string>();
  for (const service of config.services) {
    if (!service.id || !service.type) {
      throw new Error(
        `every entry in "services" needs an "id" and a "type": ${JSON.stringify(service)}`,
      );
    }
    if (seenIds.has(service.id)) {
      throw new Error(`duplicate service id in "services": ${service.id}`);
    }
    seenIds.add(service.id);
  }

  const seenPorts = new Map<number, string>();
  for (const service of config.services) {
    if (service.port === undefined) {
      continue;
    }
    if (
      !Number.isInteger(service.port) ||
      service.port < 1 ||
      service.port > 65535
    ) {
      throw new Error(
        `invalid port for service "${service.id}": ${JSON.stringify(service.port)}`,
      );
    }
    if (service.port === mainPort) {
      throw new Error(
        `service "${service.id}" can't use port ${service.port} - that's the main port (PORT) all services are served on under /<id>`,
      );
    }
    const other = seenPorts.get(service.port);
    if (other) {
      throw new Error(
        `services "${other}" and "${service.id}" both use port ${service.port} - each port maps to exactly one service`,
      );
    }
    seenPorts.set(service.port, service.id);
  }
}
