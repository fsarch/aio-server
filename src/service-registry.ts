import type { ServiceMountDescriptor } from "@fsarch/server";
import { descriptor as calendarDescriptor } from "@fsarch/calendar-server";
import { descriptor as dblightServerDescriptor } from "@fsarch/dblight-server";
import { descriptor as metricDescriptor } from "@fsarch/metric-server";
import { descriptor as functionGatewayDescriptor } from "@fsarch/function-gateway";
import { descriptor as functionServerDescriptor } from "@fsarch/function-server";
import { descriptor as functionNodeWorkerDescriptor } from "@fsarch/function-node-worker";
import { descriptor as imageEditorServerDescriptor } from "@fsarch/image-editor-server";
import { descriptor as imageServerDescriptor } from "@fsarch/image-server";
import { descriptor as frontierApiDescriptor } from "@fsarch/frontier-api";
import { descriptor as materialTracingServerDescriptor } from "@fsarch/material-tracing-server";
import { descriptor as printerServerDescriptor } from "@fsarch/printer-server";
import { descriptor as productServerDescriptor } from "@fsarch/product-server";

/** A mounted service's own descriptor, minus `id` - that's assigned per `services[]` entry in config, not fixed per type. */
export type MountableServiceDescriptor = Omit<ServiceMountDescriptor, "id">;

/**
 * Every service type this harness knows how to mount, keyed by the `type`
 * string used in `config.yaml`'s `services[].type`. The same type can be
 * referenced more than once with different `id`s to mount it repeatedly
 * under different route prefixes/connections - see `config/config.template.yml`.
 */
export const SERVICE_TYPES: Record<string, MountableServiceDescriptor> = {
  "calendar-server": calendarDescriptor,
  "metric-server": metricDescriptor,
  "function-gateway": functionGatewayDescriptor,
  "function-server": functionServerDescriptor,
  "function-node-worker": functionNodeWorkerDescriptor,
  "image-editor-server": imageEditorServerDescriptor,
  "image-server": imageServerDescriptor,
  "frontier-api": frontierApiDescriptor,
  "material-tracing-server": materialTracingServerDescriptor,
  "product-server": productServerDescriptor,
  "printer-server": printerServerDescriptor,
  "dblight-server": dblightServerDescriptor,
};
