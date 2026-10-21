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
 */
export type AioServerServiceEntry = {
  id: string;
  type: string;
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

  return config;
}
