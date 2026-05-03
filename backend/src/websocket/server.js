import fastifyWebsocket from '@fastify/websocket';
import zmqSubscriber from '../zmq/subscriber.js';

export const clients = new Set();

export function broadcast(data) {
  const payload = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(payload);
    }
  }
}

export async function setupWebSocket(fastify) {
  await fastify.register(fastifyWebsocket);

  fastify.get('/ws', { websocket: true }, (socket) => {
    clients.add(socket);
    console.log(`[ws] Client connected. Total: ${clients.size}`);

    socket.on('message', (msg) => {
      if (msg.toString() === 'ping') {
        socket.send('pong');
      }
    });

    socket.on('close', () => {
      clients.delete(socket);
      console.log(`[ws] Client disconnected. Total: ${clients.size}`);
    });

    socket.on('error', (err) => {
      console.error('[ws] Socket error:', err.message);
      clients.delete(socket);
    });
  });

  zmqSubscriber.on('block', (data)    => broadcast({ type: 'block',   data }));
  zmqSubscriber.on('tx',    (data)    => broadcast({ type: 'tx',      data }));
  zmqSubscriber.on('tx_hash', (data)  => broadcast({ type: 'tx_hash', data }));
  zmqSubscriber.on('alert', (data)    => broadcast({ type: 'alert',   data }));

  console.log('[ws] WebSocket server ready at /ws');
}
