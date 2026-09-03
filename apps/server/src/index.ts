import { APP_NAME, PROTOCOL_VERSION } from "@hangul-rummikub/shared";

import { createHttpServer } from "./server.js";

const DEFAULT_PORT = 3001;
const configuredPort = process.env.PORT;
const port = configuredPort === undefined ? DEFAULT_PORT : Number(configuredPort);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const { httpServer } = createHttpServer();

httpServer.listen(port, "0.0.0.0", () => {
  console.log(
    `${APP_NAME} protocol v${PROTOCOL_VERSION} server is running on port ${port}.`,
  );
});
