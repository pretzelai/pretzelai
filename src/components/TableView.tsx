import "../index.css"
import "@blueprintjs/table/lib/css/table.css"

import { useEffect, useState } from "react"
import {
  tableViewQueryBuilder,
  mergeQueries,
  formatDataForTable,
} from "../lib/utils"
import { Column, Cell, Table2 } from "@blueprintjs/table"
import { useStore } from "../store/useStore"

export default function TableView({ rowAmount = 1000 }: { rowAmount: number }) {
  const { query, lastQuery } = useStore()
  const [columns, setColumns] = useState<string[]>([])
  const [rows, setRows] = useState<(string | number)[][]>([])

  useEffect(() => {
    if (lastQuery()) {
      const fetch = async () => {
        const q = mergeQueries(lastQuery(), tableViewQueryBuilder(rowAmount))
        const { rowsJson, result } = await query(q)
        if (rowsJson?.length > 0) {
          const columnNames: string[] = Object.keys(rowsJson[0])
          setColumns(columnNames)
          const formattedRows = formatDataForTable(
            rowsJson,
            result.schema.fields
          )
          setRows(
            formattedRows.map((row: (string | number)[]) =>
              columnNames.map((col: string) => (row as any)[col])
            )
          )
        } else {
          setRows([])
        }
      }
      fetch()
    }
  }, [lastQuery()])

  if (!rows.length) {
    return <div>No data / Zero rows returned</div>
  }

  const renderCell = (rowIndex: number, columnIndex: number) => {
    return <Cell>{rows[rowIndex][columnIndex]}</Cell>
  }

  return (
    <div className="h-screen overflow-auto">
      <Table2 numRows={rows.length} cellRendererDependencies={rows}>
        {columns.map((col, index) => (
          <Column key={index} name={col} cellRenderer={renderCell} />
        ))}
      </Table2>
    </div>
  )
}
