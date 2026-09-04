import { APP_NAME, PROTOCOL_VERSION } from "@hangul-rummikub/shared";

import { createHttpServer } from "./server.js";

const DEFAULT_PORT = 3001;
const configuredPort = process.env.PORT;
const port = configuredPort === undefined ? DEFAULT_PORT : Number(configuredPort);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const server = createHttpServer();

let shutdownRequested = false;
const requestShutdown = (signal: NodeJS.Signals): void => {
  if (shutdownRequested) {
    return;
  }
  shutdownRequested = true;
  console.log(`Received ${signal}; shutting down.`);
  void server.shutdown().catch(() => {
    console.error("The production server could not shut down cleanly.");
    process.exitCode = 1;
  });
};

process.once("SIGTERM", () => requestShutdown("SIGTERM"));
process.once("SIGINT", () => requestShutdown("SIGINT"));

server.httpServer.listen(port, "0.0.0.0", () => {
  console.log(
    `${APP_NAME} protocol v${PROTOCOL_VERSION} server is running on port ${port}.`,
  );
});
