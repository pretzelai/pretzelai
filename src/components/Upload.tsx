import { AsyncDuckDB } from "../lib/duckdb"
import * as arrow from "apache-arrow"
import Block from "./ui/Block"
import * as XLSX from "xlsx"
import Papa from "papaparse"
import { Cell } from "../lib/utils"
import { uploadQueryBuilder, INPUT_TABLE } from "../lib/utils"
import { useState } from "react"
import { loading } from "./ui/loading"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import axios from "axios"

const DEMO_CSV_URL = "https://pretzelai.github.io/seed_investment_data.csv"

export default function Upload({
  db,
  updateQuery,
  cell,
  setCells,
}: {
  db: AsyncDuckDB | null
  updateQuery: (q: string) => void
  cell: Cell
  setCells: (cells: Cell[]) => void
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [csvUrl, setCsvUrl] = useState("")
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isResetCells, setIsResetCells] = useState(true)

  const processCsvContent = async (csvContent: string, sourceName: string) => {
    if (!db) {
      console.error("Database not initialized.")
      return
    }
    try {
      const c = await db.connect()
      const parseResults = Papa.parse(csvContent, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
      })

      let columnTypes: { [key: string]: any } = {}
      const dataSample =
        parseResults.data.length > 1000
          ? parseResults.data.slice(
              0,
              Math.ceil(parseResults.data.length * 0.1)
            )
          : parseResults.data

      // Iterate over each column
      for (const columnName in dataSample[0] as any) {
        let isBoolean = false
        let isInteger = false
        let isFloat = false
        let isBigInt = false
        let isString = false
        for (const row of dataSample as Array<{ [key: string]: any }>) {
          const value = row[columnName]
          if (value !== null && value !== undefined) {
            const valueType = typeof value
            if (valueType === "boolean") isBoolean = true
            if (valueType === "string") isString = true
            if (valueType === "bigint") isBigInt = true
            if (valueType === "number") {
              if (Number.isInteger(value)) isInteger = true
              else isFloat = true
            }
          }
        }

        if (isString) {
          columnTypes[columnName] = new arrow.Utf8()
        } else if (isFloat) {
          columnTypes[columnName] = new arrow.Float64()
        } else if (isBigInt) {
          columnTypes[columnName] = new arrow.Int64()
        } else if (isInteger) {
          columnTypes[columnName] = new arrow.Int32()
        } else if (isBoolean) {
          columnTypes[columnName] = new arrow.Bool()
        } else {
          columnTypes[columnName] = new arrow.Utf8()
        }
      }

      const csvString = Papa.unparse(parseResults.data, {
        header: true,
        skipEmptyLines: true,
      })

      await db.registerFileText(sourceName, csvString)
      if (cell.query) {
        await c.query(`DROP TABLE "${INPUT_TABLE}"`)
      }
      await c.insertCSVFromPath(sourceName, {
        schema: "main",
        name: INPUT_TABLE,
        columns: columnTypes,
        detect: true,
      })
      await c.close()
      const uploadQuery = uploadQueryBuilder(INPUT_TABLE)
      if (isResetCells) {
        setCells([{ type: "upload", query: uploadQuery }])
      } else {
        updateQuery(uploadQuery)
      }
    } catch (error) {
      console.error(`Error processing CSV content from ${sourceName}:`, error)
    }
  }

  const urlCsvUpload = async (url: string) => {
    setIsLoading(true)
    try {
      const response = await axios.get(`https://corsproxy.io/?${url}`)
      const csvContent = response.data
      await processCsvContent(csvContent, "url_file")
    } catch (error) {
      console.error("Error downloading demo CSV:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleFileUpload = async (event: any) => {
    const file = event.target.files[0]
    if (!file) {
      console.error("No file selected.")
      return
    }
    setIsLoading(true)
    const reader = new FileReader()
    reader.onload = async (e) => {
      let csvContent
      if (file.type.includes("excel") || file.type.includes("spreadsheetml")) {
        const workbook = XLSX.read(e.target?.result, { type: "binary" })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        csvContent = XLSX.utils.sheet_to_csv(worksheet)
      } else {
        csvContent = e.target?.result as string
      }
      await processCsvContent(csvContent, file.name)
      setIsLoading(false)
    }
    if (file.type.includes("excel") || file.type.includes("spreadsheetml")) {
      reader.readAsBinaryString(file)
    } else {
      reader.readAsText(file)
    }
  }

  return (
    <Block className="mb-4 flex-col" title="Upload">
      <div className="grid w-full max-w-sm items-center gap-1.5">
        <Label htmlFor="file_upload">Upload from your device</Label>
        <div className="flex items-center">
          {isLoading && loading}
          <Input
            id="file_upload"
            type="file"
            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
            onChange={handleFileUpload}
            disabled={isLoading}
          />
        </div>
      </div>
      <div className="mt-2 grid w-full max-w-sm items-center gap-1.5">
        <Label htmlFor="url_upload">Upload CSV from url</Label>
        <div className="flex items-center">
          {isLoading && loading}
          <Input
            id="url_upload"
            type="text"
            value={csvUrl}
            onChange={(e) => setCsvUrl(e.target.value)}
            disabled={isLoading}
            placeholder={DEMO_CSV_URL}
          />
          <Button onClick={() => urlCsvUpload(csvUrl || DEMO_CSV_URL)}>
            Load
          </Button>
        </div>
      </div>
      <Button className="my-4" onClick={() => urlCsvUpload(DEMO_CSV_URL)}>
        Load Demo CSV
      </Button>
      {/* <div className="flex items-center space-x-2">
        <Checkbox
          id="terms"
          checked={isResetCells}
          onCheckedChange={() => setIsResetCells(!isResetCells)}
        />
        <label
          htmlFor="terms"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          Reset workflow on new upload
        </label>
      </div> */}
    </Block>
  )
}
