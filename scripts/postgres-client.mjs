let poolPromise = null;

export function isPostgresConfigured() {
  return Boolean(process.env.DATABASE_URL || (process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME));
}

export async function queryPostgres(text, params = []) {
  const pool = await getPool();
  return pool.query(text, params);
}

async function getPool() {
  if (!isPostgresConfigured()) {
    throw new Error("Postgres is not configured. Set DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME.");
  }
  if (!poolPromise) poolPromise = createPool();
  return poolPromise;
}

async function createPool() {
  const { Pool } = await import("pg");
  const pool = new Pool(getPoolConfig());
  pool.on("error", (error) => {
    console.warn(`[postgres] idle client error: ${error.message}`);
  });
  return pool;
}

function getPoolConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: getSslConfig()
    };
  }
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: getSslConfig()
  };
}

function getSslConfig() {
  if (process.env.DB_SSL === "true") return { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false" };
  return false;
}
