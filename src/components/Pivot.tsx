import "../index.css"
import "@blueprintjs/table/lib/css/table.css"

import React, { useEffect, useState } from "react"
import { AsyncDuckDB } from "../lib/duckdb"
import {
  formatDataForTable,
  getFieldsQueryBuilder,
  mergeQueries,
  query,
} from "../lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"
import { Cell, Column, Table2 } from "@blueprintjs/table"

export default function PivotTable({
  db,
  updateQuery,
  prevQuery,
}: {
  db: AsyncDuckDB | null
  updateQuery: (q: string) => void
  prevQuery: string
}) {
  const [availableColumns, setAvailableColumns] = useState<string[]>([])
  const [rows, setRows] = useState<string[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [values, setValues] = useState<
    { column: string; aggregation: string }[]
  >([])
  const [gridData, setGridData] = useState<any[]>([])
  const [gridColumns, setGridColumns] = useState<any[]>([])

  useEffect(() => {
    const fetchAndSetAvailableColumns = async () => {
      if (db) {
        try {
          const { result } = await query(
            db,
            mergeQueries(prevQuery, getFieldsQueryBuilder())
          )
          setAvailableColumns(result.schema.fields.map((f: any) => f.name))
        } catch (error) {
          console.error("Error fetching available columns:", error)
        }
      }
    }
    fetchAndSetAvailableColumns()
  }, [db, prevQuery])

  useEffect(() => {
    const updatePivotQuery = async () => {
      if (rows.length > 0 || columns.length > 0 || values.length > 0) {
        const rowFields = rows
          .map((r) => `"${r}"`)
          .join(", ")
          .trim()
        const columnFields = columns
          .map((col) => `"${col}"`)
          .join(", ")
          .trim()
        const valueFields = values
          .map((value) =>
            value.aggregation === "count_distinct"
              ? `COUNT(DISTINCT "${value.column}") as "count_distinct_${value.column}"`
              : `${value.aggregation}("${value.column}") as "${value.aggregation}_${value.column}"`
          )
          .join(", ")
        let pivotQuery = `PIVOT {\n`
        if (columns.length > 0) pivotQuery += `ON ${columnFields}\n`
        if (values.length > 0) pivotQuery += `USING ${valueFields}\n`
        if (rows.length > 0) pivotQuery += `GROUP BY ${rowFields}\n`
        pivotQuery += `}`

        const q = mergeQueries(prevQuery, pivotQuery)
        updateQuery(q)
        const { rowsJson } = await query(db, q)
        if (rowsJson?.length > 0) {
          const formattedData = formatDataForTable(rowsJson)
          setGridData(formattedData)
          setGridColumns(Object.keys(rowsJson[0] || {}))
        }
      } else {
        updateQuery(prevQuery)
        setGridData([])
        setGridColumns([])
      }
    }
    updatePivotQuery()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, rows, columns, values, prevQuery, availableColumns])

  const handleDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    column: string
  ) => {
    event.dataTransfer.setData("text/plain", column)
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
  }

  const handleDrop = (
    event: React.DragEvent<HTMLDivElement>,
    section: "available" | "rows" | "columns" | "values"
  ) => {
    event.preventDefault()
    const column = event.dataTransfer.getData("text")
    setRows(rows.filter((row) => row !== column))
    setColumns(columns.filter((col) => col !== column))
    setValues(values.filter((value) => value.column !== column))
    if (section === "rows") {
      setRows([...rows, column])
    } else if (section === "columns") {
      setColumns([...columns, column])
    } else if (section === "values") {
      setValues([...values, { column, aggregation: "sum" }])
    }
  }

  const handleAggregationChange = (index: number, aggregation: string) => {
    const updatedValues = [...values]
    updatedValues[index].aggregation = aggregation
    setValues(updatedValues)
  }

  const renderColumnBlock = (column: string) => (
    <div
      key={column}
      className="cursor-move rounded bg-gray-200 px-2 py-1 text-gray-700"
      draggable
      onDragStart={(event) => handleDragStart(event, column)}
    >
      {column}
    </div>
  )

  const isColumnInUse = (column: string) => {
    return (
      rows.includes(column) ||
      columns.includes(column) ||
      values.some((value) => value.column === column)
    )
  }

  const renderCell = (rowIndex: number, columnIndex: number) => {
    const cellData = gridData[rowIndex][gridColumns[columnIndex]]
    return <Cell>{cellData}</Cell>
  }

  return (
    <Card className="mb-4 w-full">
      <CardHeader>
        <CardTitle>Pivot Table</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex">
            <div
              className="flex-1 rounded bg-gray-100 p-4"
              onDragOver={handleDragOver}
              onDrop={(event) => handleDrop(event, "available")}
            >
              <h3 className="mb-2 text-lg font-semibold">Available Columns</h3>
              <div className="flex flex-wrap gap-2">
                {availableColumns
                  .filter((column) => !isColumnInUse(column))
                  .map((column) => renderColumnBlock(column))}
              </div>
            </div>
          </div>

          <div className="flex flex-row flex-nowrap gap-4">
            <div className="basis-1/4 flex flex-col">
              <div
                className="rounded bg-gray-100 p-4"
                onDragOver={handleDragOver}
                onDrop={(event) => handleDrop(event, "rows")}
              >
                <h3 className="mb-2 text-lg font-semibold">Rows</h3>
                <div className="flex flex-wrap gap-2">
                  {rows.map((row) => renderColumnBlock(row))}
                </div>
              </div>
              <div
                className="rounded bg-gray-100 p-4 mt-4 flex-grow"
                onDragOver={handleDragOver}
                onDrop={(event) => handleDrop(event, "values")}
              >
                <h3 className="mb-2 text-lg font-semibold">Values</h3>
                <div className="space-y-2">
                  {values.map((value, index) => (
                    <div
                      key={value.column}
                      className="flex items-center space-x-2 rounded bg-white p-2 shadow-sm"
                    >
                      {renderColumnBlock(value.column)}
                      <Select
                        value={value.aggregation}
                        onValueChange={(value) =>
                          handleAggregationChange(index, value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select an aggregation" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sum">Sum</SelectItem>
                          <SelectItem value="avg">Average</SelectItem>
                          <SelectItem value="count">Count</SelectItem>
                          <SelectItem value="count_distinct">
                            Count Distinct
                          </SelectItem>
                          <SelectItem value="max">Maximum</SelectItem>
                          <SelectItem value="min">Minimum</SelectItem>
                          <SelectItem value="median">Median</SelectItem>
                          <SelectItem value="stddev">Std Dev</SelectItem>
                          <SelectItem value="variance">Variance</SelectItem>
                          <SelectItem value="first">First Value</SelectItem>
                          <SelectItem value="var_samp">Last Value</SelectItem>
                          <SelectItem value="arbitrary">
                            Arbitrary Value
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="basis-3/4 space-y-4 flex-1">
              <div
                className="rounded bg-gray-100 p-4"
                onDragOver={handleDragOver}
                onDrop={(event) => handleDrop(event, "columns")}
              >
                <h3 className="mb-2 text-lg font-semibold">Columns</h3>
                <div className="flex flex-wrap gap-2">
                  {columns.map((column) => renderColumnBlock(column))}
                </div>
              </div>
              <div className="h-72 overflow-auto">
                {gridColumns.length > 0 && (
                  <Table2 numRows={gridData.length}>
                    {gridColumns.map((col, index) => (
                      <Column
                        key={index}
                        name={col}
                        cellRenderer={(rowIndex) => renderCell(rowIndex, index)}
                      />
                    ))}
                  </Table2>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
