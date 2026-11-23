import net from 'node:net';
import { SocksClient } from 'socks';

export interface SocksTcpForwarderOptions {
  targetHost: string;
  targetPort: number;
  listenHost?: string;
  listenPort: number;
  proxyHost?: string;
  proxyPort?: number;
  connectTimeoutMs?: number;
}

/**
 * Exposes a loopback-only TCP listener and forwards each accepted connection
 * through the local Tailscale userspace SOCKS5 proxy to one fixed database host.
 *
 * The listener is deliberately bound to 127.0.0.1; it must never be exposed
 * as a public database proxy.
 */
export function startSocksTcpForwarder(options: SocksTcpForwarderOptions): Promise<net.Server> {
  const listenHost = options.listenHost ?? '127.0.0.1';
  const proxyHost = options.proxyHost ?? '127.0.0.1';
  const proxyPort = options.proxyPort ?? 1055;
  const connectTimeoutMs = options.connectTimeoutMs ?? 10000;

  if (listenHost !== '127.0.0.1' && listenHost !== '::1') {
    return Promise.reject(new Error('The PostgreSQL SOCKS forwarder may only bind to loopback.'));
  }
  if (!options.targetHost || !Number.isInteger(options.targetPort) ||
      options.targetPort < 1 || options.targetPort > 65535 ||
      !Number.isInteger(options.listenPort) || options.listenPort < 1 || options.listenPort > 65535) {
    return Promise.reject(new Error('Invalid PostgreSQL SOCKS forwarder address.'));
  }

  const server = net.createServer((clientSocket) => {
    clientSocket.setNoDelay(true);
    const timeout = setTimeout(() => clientSocket.destroy(), connectTimeoutMs + 1000);

    void SocksClient.createConnection({
      proxy: { host: proxyHost, port: proxyPort, type: 5 },
      command: 'connect',
      destination: { host: options.targetHost, port: options.targetPort },
      timeout: connectTimeoutMs,
    }).then(({ socket }) => {
      clearTimeout(timeout);
      if (clientSocket.destroyed) {
        socket.destroy();
        return;
      }

      if (typeof socket.setNoDelay === 'function') socket.setNoDelay(true);
      clientSocket.pipe(socket);
      socket.pipe(clientSocket);

      clientSocket.once('close', () => socket.destroy());
      socket.once('close', () => clientSocket.destroy());
      clientSocket.once('error', () => socket.destroy());
      socket.once('error', () => clientSocket.destroy());
    }).catch((error: unknown) => {
      clearTimeout(timeout);
      console.warn('PostgreSQL Tailscale tunnel connection failed.', error instanceof Error ? error.message : error);
      clientSocket.destroy();
    });
  });

  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once('error', onError);
    server.listen(options.listenPort, listenHost, () => {
      server.removeListener('error', onError);
      resolve(server);
    });
  });
}
