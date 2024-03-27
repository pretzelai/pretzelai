import "../index.css"
import "@blueprintjs/table/lib/css/table.css"

import { useEffect, useState } from "react"
import {
  tableViewQueryBuilder,
  mergeQueries,
  formatDataForTable,
} from "../lib/utils"
import { Column, Cell, Table2 } from "@blueprintjs/table"
import { useCell } from "../store/useStore"

export default function TableBlock({
  id,
  rowAmount = 100,
}: {
  id: number
  rowAmount: number
}) {
  const { query, prevQuery, updateQuery } = useCell(id)
  const [columns, setColumns] = useState<string[]>([])
  const [rows, setRows] = useState<(string | number)[][]>([])

  useEffect(() => {
    if (prevQuery) {
      const fetch = async () => {
        const q = mergeQueries(prevQuery, tableViewQueryBuilder(rowAmount))
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
        updateQuery(prevQuery)
      }
      fetch()
    }
  }, [prevQuery])

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
