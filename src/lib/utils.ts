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
  | "sort"
  | "userquery"
  | "python"

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

export const filterQueryOperatorBuilder = (filter: string,operator:string,value:string) => {
  // SQL
  // return `select * from table where (${filter}) (${operator}) (${value})`
  // PRQL
  if(filter && operator){
    if(value){
      if(operator=='equals'){
        return `filter ${filter} == '${value}'`
      }
      if(operator=='not equals'){
        return `filter ${filter} != '${value}'`
      }
    }
    else{ // for handling non null operator
      return `filter ${filter} != null`
    }
  }
  return ""
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
    // Split the modified PRQL into chunks based on pivot and SQL blocks, preserving the blocks
    let allChunks = modifiedPrql
      .split(/(PIVOT\s*{[^}]*}|SQL\s*{[^}]*})/)
      .filter((chunk) => chunk !== "")

    let finalSql: string | undefined = ""

    if (
      allChunks.length === 1 &&
      !allChunks[0].startsWith("PIVOT") &&
      !allChunks[0].startsWith("SQL")
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
        } else if (chunk.startsWith("SQL")) {
          chunkObjects.push({ type: "SQL", chunk })
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
        } else if (type === "SQL") {
          const sql = chunk
            .replace(/SQL\s*{/, "")
            .replace(/}\s*$/, "")
            .replace(/`AI_Table`/g, currentTable) // handle case with backticks
            .replace("AI_Table", currentTable)
            .replace(/`PrevTable`/g, currentTable) // handle case with backticks
            .replace("PrevTable", currentTable)
          currentTable = `table${i + 1}`
          ctes.push(`${currentTable} as (${sql})`)
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

export function formatDataForTable(rowsJson: any, fields: any[]) {
  // TODO: Write in WASM
  const fieldTypeMap: Record<string, string> = {}
  fields.forEach((field: any) => {
    fieldTypeMap[field.name] = field.type.toString()
  })
  return rowsJson.map((row: Record<string, any>) => {
    const formattedRow: Record<string, any> = {}
    Object.keys(row).forEach((key) => {
      const value = row[key]
      const fieldType = fieldTypeMap[key]
      if (value === null || value === undefined || Number.isNaN(value)) {
        formattedRow[key] = ""
      } else if (fieldType === "Utf8") {
        formattedRow[key] = value // Strings are left unchanged
      } else if (fieldType === "Int32") {
        formattedRow[key] = value
      } else if (fieldType === "Int64") {
        if (parseInt(value).toString() !== value.toString())
          // it's an actual bigInt
          formattedRow[key] = parseFloat(value)
        else formattedRow[key] = parseInt(value)
      } else if (fieldType.includes("Float")) {
        formattedRow[key] =
          typeof value === "number" ? Math.round(value * 100) / 100 : value
      } else if (fieldType === "Timestamp<MICROSECOND>") {
        formattedRow[key] =
          value instanceof Date
            ? value.toISOString()
            : new Date(value).toISOString()
      } else if (fieldType === "Uint32Array") {
        formattedRow[key] = value instanceof Uint32Array ? value[0] : value
      } else {
        // Non-number and non-date values are left unchanged
        formattedRow[key] = value
      }
    })
    return formattedRow
  })
}
