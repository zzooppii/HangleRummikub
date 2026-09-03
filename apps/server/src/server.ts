import { createServer as createNodeServer } from "node:http";

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
}>;

export function createHttpServer(options: CreateHttpServerOptions = {}) {
  const app = express();

  app.get("/health", (_request, response) => {
    response.status(200).json({ ok: true });
  });

  const httpServer = createNodeServer(app);
  const io = new SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    EmptyEvents,
    EmptySocketData
  >(httpServer);
  const runtime = options.runtime ?? createApplicationRuntime();

  registerSocketIoHandlers(io, runtime);

  return { httpServer, io, runtime };
}
