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
import { BoxIcon } from "./Icons"

export default function TableView({ rowAmount = 1000 }: { rowAmount: number }) {
  const { query, lastQuery } = useStore()
  const [columns, setColumns] = useState<string[]>([])
  const [rows, setRows] = useState<any[][]>([])

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
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6">
        <BoxIcon className="w-16 h-16 text-gray-500" />
        <h3 className="text-2xl font-bold">No Data Available</h3>
        <p className="text-gray-500 text-center max-w-md">
          It appears that there is no data to display at the moment. Please
          upload a file or paste a CSV URL.
        </p>
      </div>
    )
  }

  const renderCell = (rowIndex: number, columnIndex: number) => {
    const row = rows[rowIndex][columnIndex]
    return <Cell>{typeof row === "object" ? row.toString() : row}</Cell>
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
