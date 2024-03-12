import "../index.css"
import "@blueprintjs/table/lib/css/table.css"

import { useEffect, useState } from "react"
import { AsyncDuckDB } from "../lib/duckdb"
import {
  query,
  tableViewQueryBuilder,
  mergeQueries,
  formatDataForTable,
} from "../lib/utils"
import { Column, Cell, Table2 } from "@blueprintjs/table"

export default function TableView({
  db,
  updateQuery,
  prevQuery,
  rowAmount = 100,
}: {
  db: AsyncDuckDB | null
  updateQuery: (q: string) => void
  prevQuery: string
  rowAmount: number
}) {
  const [columns, setColumns] = useState<string[]>([])
  const [rows, setRows] = useState<(string | number)[][]>([])

  useEffect(() => {
    if (db && prevQuery) {
      const fetch = async () => {
        const q = mergeQueries(prevQuery, tableViewQueryBuilder(rowAmount))
        const { rowsJson } = await query(db, q)
        if (rowsJson?.length > 0) {
          const columnNames: string[] = Object.keys(rowsJson[0])
          setColumns(columnNames)
          const formattedRows = formatDataForTable(rowsJson)
          setRows(
            formattedRows.map((row: (string | number)[]) =>
              columnNames.map((col: string) => (row as any)[col])
            )
          )
        } else {
          setRows([])
        }
        updateQuery(prevQuery)
      }
      fetch()
    }
  }, [db, prevQuery])

  if (!rows.length) {
    return <div>No data / Zero rows returned</div>
  }

  const renderCell = (rowIndex: number, columnIndex: number) => {
    return <Cell>{rows[rowIndex][columnIndex]}</Cell>
  }

  return (
    <div className="h-screen overflow-auto">
      <Table2 numRows={rows.length}>
        {columns.map((col, index) => (
          <Column key={index} name={col} cellRenderer={renderCell} />
        ))}
      </Table2>
    </div>
  )
}
