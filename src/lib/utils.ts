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

export const debounce = (f: Function, ms = 300) => {
  let timeout: ReturnType<typeof setTimeout>
  return function (this: any, ...args: any[]) {
    clearTimeout(timeout)
    timeout = setTimeout(() => f.apply(this, args), ms)
  }
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
    // Split the modified PRQL into chunks based on pivot and AIGENSQL blocks, preserving the blocks
    let allChunks = modifiedPrql
      .split(/(PIVOT\s*{[^}]*}|AIGENSQL\s*{[^}]*})/)
      .filter((chunk) => chunk !== "")

    let finalSql: string | undefined = ""

    if (
      allChunks.length === 1 &&
      !allChunks[0].startsWith("PIVOT") &&
      !allChunks[0].startsWith("AIGENSQL")
    ) {
      // If there's only one chunk and it's not a special block, compile it directly
      finalSql = compile(modifiedPrql, opts)
    } else {
      const chunkObjects: Array<{ type: string; chunk: string }> = []

      allChunks.forEach((chunk) => {
        // add code to skip empty chunks
        if (chunk.trim() === "") {
          return
        } else if (chunk.startsWith("PIVOT")) {
          chunkObjects.push({ type: "PIVOT", chunk })
        } else if (chunk.startsWith("AIGENSQL")) {
          chunkObjects.push({ type: "AIGENSQL", chunk })
        } else {
          chunkObjects.push({ type: "PRQL", chunk })
        }
      })

      const ctes: string[] = []
      let currentTable = ""
      chunkObjects.forEach((chunkObject, i) => {
        const { type, chunk } = chunkObject
        let chunkWithTable = chunk
        if (type === "PRQL") {
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
        } else if (type === "AIGENSQL") {
          const aigensqlSql = chunk
            .replace(/AIGENSQL\s*{/, "")
            .replace(/}\s*$/, "")
            .replace(/`AI_Table`/g, currentTable) // handle case with backticks
            .replace("AI_Table", currentTable)
          currentTable = `table${i + 1}`
          ctes.push(`${currentTable} as (${aigensqlSql})`)
        }
      })
      finalSql = `with ${ctes.join(", ")}\nSELECT * FROM ${currentTable}`
    }

    const c = await db.connect()
    result = await c.query(finalSql)
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
