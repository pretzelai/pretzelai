import * as duckdb from "@duckdb/duckdb-wasm"

export const initDb = async () => {
  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles()
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES)
  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker!}");`], {
      type: "text/javascript",
    })
  )
  const worker = new Worker(worker_url)
  const logger = new duckdb.ConsoleLogger()
  const db = new duckdb.AsyncDuckDB(logger, worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  URL.revokeObjectURL(worker_url)
  return db
}

export type AsyncDuckDB = duckdb.AsyncDuckDB

export const DuckDBDataProtocol = duckdb.DuckDBDataProtocol
