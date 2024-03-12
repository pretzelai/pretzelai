import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { compile, CompileOptions } from "prql-js/dist/bundler"

export const INPUT_TABLE = "InputTable"

export type CellType =
  | "upload"
  | "filter"
  | "pivot"
  | "table"
  | "columns"
  | "derive"
  | "chart"
  | "download"
  | "AI"

export type Cell = {
  type: CellType
  query?: string
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const uploadQueryBuilder = (table: string) => {
  // SQL
  // return `select * from '${table}'`
  // PRQL
  return `from ${table} #${Math.random()}` // force refresh when new upload
}

export const getFieldsQueryBuilder = () => {
  // SQL
  // return `select * from table limit 1`
  // PRQL
  return `take 1`
}

export const getFieldValuesQueryBuilder = (field: string) => {
  // SQL
  // return `select distinct "${field}" from table;`
  // PRQL
  return `group \`${field}\` (take 1)`
}

export const columnFilterQueryBuilder = (columns: string[]) => {
  // SQL
  // return `select "${columns.join(`","`)}" from table`
  // PRQL
  return "select {`" + columns.join("`,`") + "`}"
}

export const columnErrorQueryBuilder = (columns: string[]) => {
  // SQL
  // return `select "${columns.join(`","`)}" from table limit 1`
  // PRQL
  return "select {`" + columns.join("`,`") + "`}\ntake 1"
}

export const filterQueryBuilder = (filter: string) => {
  // SQL
  // return `select * from table where (${filter})`
  // PRQL
  return filter ? `filter ${filter}` : ""
}

export const tableViewQueryBuilder = (rowAmount: number) => {
  // SQL
  // return `select * from table limit ${rowAmount}`
  // PRQL
  return `take ${rowAmount}`
}

export const mergeQueries = (accQuery: string, nextQuery: string) => {
  // SQL
  // return nextQuery.replace("table", `(${accQuery})`)
  // PRQL
  return `${accQuery}\n${nextQuery}`
}

export const query = async (db: any, modifiedPrql: string) => {
  let result
  try {
    const opts = new CompileOptions()
    opts.signature_comment = false
    modifiedPrql = modifiedPrql.trim()
    // console.log("Modified PRQL: ", modifiedPrql)
    // Split the modified PRQL into chunks based on pivot blocks
    let prqlChunks = modifiedPrql.split(/PIVOT\s*{[^}]*}/) || []
    if (
      prqlChunks.length > 0 &&
      prqlChunks[prqlChunks.length - 1].length === 0
    ) {
      prqlChunks.pop()
    }
    const pivotBlocks = modifiedPrql.match(/PIVOT\s*{[^}]*}/g) || []
    if (
      pivotBlocks.length > 0 &&
      pivotBlocks[pivotBlocks.length - 1].length === 0
    ) {
      pivotBlocks.pop()
    }

    let finalSql: string | undefined = ""

    if (pivotBlocks.length === 0) {
      finalSql = compile(modifiedPrql, opts)
    } else {
      const chunkObjects: Array<{ type: string; chunk: string }> = []

      prqlChunks.forEach((prqlChunk, index) => {
        // Add the PRQL chunk first
        chunkObjects.push({ type: "PRQL", chunk: prqlChunk })

        // Now, check if there is a corresponding pivot block.
        // If there is, add it to the combined array.
        if (index < pivotBlocks.length) {
          chunkObjects.push({ type: "PIVOT", chunk: pivotBlocks[index] })
        }
      })

      const ctes: string[] = []
      let currentTable = ""
      for (let i = 0; i < chunkObjects.length; i++) {
        const { type, chunk } = chunkObjects[i]
        if (type === "PRQL") {
          let chunkWithTable = chunk
          if (i > 0) {
            chunkWithTable = `from ${currentTable}\n${chunk}`
          }
          const sql = compile(chunkWithTable, opts)
          currentTable = `table${i + 1}`
          ctes.push(`${currentTable} as (${sql})`)
        } else if (type === "PIVOT") {
          const pivotSql = chunk
            .replace(/PIVOT\s*{/, `PIVOT ${currentTable} `)
            .replace(/}\s*$/, "")

          currentTable = `table${i + 1}`
          ctes.push(`${currentTable} as (${pivotSql})`)
        }
      }
      finalSql = `with ${ctes.join(", ")}\nSELECT * FROM ${currentTable}`
    }
    // console.log("Final SQL: ", finalSql)

    const c = await db.connect()
    result = await c.query(finalSql)
    // console.log("duckdb error")
    await c.close()
  } catch (e) {
    console.error(e)
  }
  return {
    rowsJson: result && result.toArray().map((row: any) => row.toJSON()),
    result,
  }
}

export function formatDataForTable(rowsJson: any) {
  // TODO: Write in WASM
  return rowsJson.map((row: Record<string, any>) => {
    const formattedRow: Record<string, any> = {} // Define formattedRow with string keys and any type values
    Object.keys(row).forEach((key) => {
      const value = row[key]
      if (typeof value === "bigint") {
        formattedRow[key] = value.toString()
      } else if (typeof value === "number") {
        if (Number.isInteger(value)) {
          formattedRow[key] = value // Return integer as is
        } else {
          // For floats, limit to 2 decimal places without converting to string
          formattedRow[key] = Math.round(value * 100) / 100
        }
      } else if (value instanceof Date) {
        // Convert Date to ISO string
        formattedRow[key] = value.toISOString()
      } else if (value instanceof Uint32Array) {
        // TODO: DuckDB returns this when group-by is called
        formattedRow[key] = value[0]
      } else {
        // Non-number and non-date values are left unchanged
        formattedRow[key] = value
      }
    })
    return formattedRow
  })
}
