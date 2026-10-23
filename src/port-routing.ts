import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import type { Duplex } from "node:stream";
import { prefixRoutePath } from "@fsarch/server/custom-resource";

const URI_VERSION_PREFIX = /^\/v\d+(?=\/|$)/;

function isMountPath(path: string, mountId: string): boolean {
	const withoutVersion = path.replace(URI_VERSION_PREFIX, "");
	return (
		withoutVersion === `/${mountId}` ||
		withoutVersion.startsWith(`/${mountId}/`)
	);
}

/**
 * Rewrites a request URL as a standalone client of a service would send it
 * (`/v1/parts?x=1`, `/.ai/mcp`) onto that service's mount inside the shared
 * app (`/v1/<id>/parts?x=1`, `/<id>/.ai/mcp`) - same version-before-prefix
 * rule `@fsarch/server` uses for the mount routes themselves.
 *
 * URLs that already point at this mount pass through unchanged, so prefixed
 * links the app hands out (e.g. custom-resource `apiRoutes` paths) work on
 * the service's own port too.
 */
export function rewriteToMount(url: string, mountId: string): string {
	const queryIndex = url.search(/[?#]/);
	const path = queryIndex === -1 ? url : url.slice(0, queryIndex);
	const rest = queryIndex === -1 ? "" : url.slice(queryIndex);

	if (isMountPath(path, mountId)) {
		return url;
	}

	return `${prefixRoutePath(path || "/", mountId)}${rest}`;
}

type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

/**
 * Starts an extra HTTP server on `port` that serves exactly one mount: every
 * request is rewritten onto `/<mountId>` (see `rewriteToMount()`) and handed
 * to the main app's own request handler, so there is still only one Nest
 * application (one DI container, one set of DB connections) - this is just a
 * second door into it. WebSocket upgrades are rewritten the same way and
 * re-emitted on the main server, where the app's WebSocket adapter (if any)
 * listens for them.
 */
export async function listenForMount(options: {
	port: number;
	mountId: string;
	handler: RequestHandler;
	mainServer: Server;
}): Promise<Server> {
	const { port, mountId, handler, mainServer } = options;

	const server = createServer((req, res) => {
		req.url = rewriteToMount(req.url ?? "/", mountId);
		handler(req, res);
	});

	server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
		req.url = rewriteToMount(req.url ?? "/", mountId);
		if (mainServer.listenerCount("upgrade") === 0) {
			socket.destroy();
			return;
		}
		mainServer.emit("upgrade", req, socket, head);
	});

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, () => {
			server.off("error", reject);
			resolve();
		});
	});

	return server;
}
