const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,brl,eur&include_24hr_change=true';

const CACHE_TTL = 60_000; // 60 segundos

let cache = null;
let cacheAt = 0;

async function fetchPrice() {
  const res = await fetch(COINGECKO_URL, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`CoinGecko HTTP ${res.status}`);
  }

  const json = await res.json();
  const btc = json.bitcoin;

  return {
    usd:        btc.usd,
    brl:        btc.brl,
    eur:        btc.eur,
    usd_24h:    btc.usd_24h_change,
    brl_24h:    btc.brl_24h_change,
    eur_24h:    btc.eur_24h_change,
    updatedAt:  Date.now(),
  };
}

export async function setupPriceRoutes(fastify) {
  fastify.get('/api/price', async (_req, reply) => {
    const now = Date.now();

    if (cache && now - cacheAt < CACHE_TTL) {
      return { ...cache, cached: true };
    }

    try {
      cache = await fetchPrice();
      cacheAt = now;
      return { ...cache, cached: false };
    } catch (err) {
      if (cache) {
        return { ...cache, cached: true, stale: true };
      }
      return reply.code(502).send({ error: err.message });
    }
  });
}
