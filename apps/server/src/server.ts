import { statSync } from "node:fs";
import {
  createServer as createNodeServer,
  type IncomingMessage,
} from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@hangul-rummikub/shared";
import express from "express";
import { Server as SocketIOServer } from "socket.io";

import {
  createApplicationRuntime,
  type ApplicationRuntime,
} from "./composition-root.js";
import { registerSocketIoHandlers } from "./transport/socket-io.js";

type EmptyEvents = Record<never, never>;
type EmptySocketData = Record<never, never>;

export type CreateHttpServerOptions = Readonly<{
  runtime?: ApplicationRuntime;
  serveWeb?: boolean;
  webDistPath?: string;
}>;

const DEFAULT_WEB_DIST_PATH = fileURLToPath(
  new URL("../../web/dist", import.meta.url),
);

function assertProductionWebBuild(webDistPath: string): void {
  try {
    if (
      !statSync(webDistPath).isDirectory() ||
      !statSync(join(webDistPath, "index.html")).isFile()
    ) {
      throw new Error();
    }
  } catch {
    throw new Error(
      'Production web build is missing. Run "npm run build" before starting the server.',
    );
  }
}

function configureProductionWebServing(
  app: express.Express,
  webDistPath: string,
): void {
  assertProductionWebBuild(webDistPath);

  app.use(
    "/assets",
    express.static(join(webDistPath, "assets"), {
      dotfiles: "ignore",
      fallthrough: true,
      immutable: true,
      index: false,
      maxAge: "1y",
    }),
  );
  app.use(
    express.static(webDistPath, {
      dotfiles: "ignore",
      fallthrough: true,
      index: false,
      maxAge: 0,
    }),
  );

  // Express 5/path-to-regexp wildcard syntax differs from Express 4. A final
  // middleware avoids a wildcard route entirely and only serves SPA HTML for
  // browser GET routes that were not handled by health, Socket.IO, or assets.
  app.use((request, response, next) => {
    const hasFileLikeSegment = request.path
      .split("/")
      .some((segment) => segment.includes("."));
    if (
      request.method !== "GET" ||
      request.path === "/health" ||
      request.path === "/api" ||
      request.path.startsWith("/api/") ||
      request.path === "/socket.io" ||
      request.path.startsWith("/socket.io/") ||
      request.path === "/assets" ||
      request.path.startsWith("/assets/") ||
      hasFileLikeSegment
    ) {
      next();
      return;
    }

    response.sendFile(join(webDistPath, "index.html"), {
      headers: {
        "Cache-Control": "no-cache",
      },
    });
  });
}

function isAllowedSocketIoOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (origin === undefined) {
    return true;
  }

  const requestHost = request.headers.host;
  if (requestHost === undefined) {
    return false;
  }

  try {
    const parsedOrigin = new URL(origin);
    return (
      (parsedOrigin.protocol === "http:" || parsedOrigin.protocol === "https:") &&
      parsedOrigin.username === "" &&
      parsedOrigin.password === "" &&
      parsedOrigin.pathname === "/" &&
      parsedOrigin.search === "" &&
      parsedOrigin.hash === "" &&
      parsedOrigin.host === requestHost
    );
  } catch {
    return false;
  }
}

export function createHttpServer(options: CreateHttpServerOptions = {}) {
  const app = express();

  app.get("/health", (_request, response) => {
    response.status(200).json({ ok: true });
  });

  const serveWeb = options.serveWeb ?? process.env.NODE_ENV === "production";
  if (serveWeb) {
    configureProductionWebServing(
      app,
      options.webDistPath ?? DEFAULT_WEB_DIST_PATH,
    );
  }

  const httpServer = createNodeServer(app);
  const io = new SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    EmptyEvents,
    EmptySocketData
  >(httpServer, {
    allowRequest: (request, callback) => {
      callback(null, isAllowedSocketIoOrigin(request));
    },
  });
  const runtime = options.runtime ?? createApplicationRuntime();

  const unregisterSocketIoHandlers = registerSocketIoHandlers(io, runtime);
  runtime.start();
  let runtimeStopped = false;
  const stopRuntime = (): void => {
    if (runtimeStopped) {
      return;
    }
    runtimeStopped = true;
    unregisterSocketIoHandlers();
    runtime.stop();
  };
  httpServer.once("close", stopRuntime);

  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (): Promise<void> => {
    if (shutdownPromise !== undefined) {
      return shutdownPromise;
    }

    shutdownPromise = io.close().then(
      () => {
        stopRuntime();
      },
      (error: unknown) => {
        stopRuntime();
        throw error;
      },
    );
    return shutdownPromise;
  };

  return { httpServer, io, runtime, shutdown };
}
