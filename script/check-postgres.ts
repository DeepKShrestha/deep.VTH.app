import { Client } from "pg";

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  const result = await client.query("select 1 as ok");
  await client.end();

  if (result.rows?.[0]?.ok !== 1) {
    throw new Error("Unexpected Postgres probe result");
  }
  console.log("Postgres connection OK");
}

run().catch((error) => {
  console.error("Postgres check failed:", error);
  process.exit(1);
});
