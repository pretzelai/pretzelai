import * as arrow from "apache-arrow"
import Block from "./ui/Block"
import { uploadQueryBuilder, INPUT_TABLE } from "../lib/utils"
import { useEffect, useState } from "react"
import { loading } from "./ui/loading"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import axios from "axios"
import { inferSchema, initParser } from "udsv"
import { json2csv } from "json-2-csv"
import XLSX from "xlsx"
import { useStore, useCell } from "../store/useStore"

const DEMO_CSV_URL =
  "https://pretzelai.github.io/github_public_code_editors.csv"

export default function Upload({ id }: { id: number }) {
  const { db, setCells } = useStore()
  const { cell } = useCell(id)
  const [isLoading, setIsLoading] = useState(false)
  const [csvUrl, setCsvUrl] = useState("")
  const [rowCount, setRowCount] = useState(0)
  const [job, setJob] = useState<{
    csvContent: string
    sourceName: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (job) {
      processCsvContent(job.csvContent, job.sourceName)
      setJob(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db])

  function determineDtype(arr: any[]) {
    const sampleSize = Math.min(arr.length, 100)
    const sampleIndices = new Set()

    while (sampleIndices.size < sampleSize) {
      const randomIndex = Math.floor(Math.random() * arr.length)
      sampleIndices.add(randomIndex)
    }

    let isFloat = false

    for (const index of Array.from(sampleIndices)) {
      const num = arr[index as number]
      if (num && !Number.isInteger(num)) {
        isFloat = true
        break
      }
    }

    return isFloat
  }

  function parseCsvContentFirstPass(csvContent: string): {
    columnTypes: { [key: string]: any }
    csvString: string
    delimiter: string
  } {
    let schema = inferSchema(csvContent)
    let parser = initParser(schema)
    let typedArrs = parser.typedArrs(csvContent)
    let typedCols = parser.typedCols(csvContent) // [ [1, 4], [2, 5], [3, 6] ]
    setRowCount(typedArrs.length)

    let columnTypes: { [key: string]: any } = {}
    let csvString = ""
    const delimiter = "\t" // Tab delimiter

    schema.cols.forEach((col, index) => {
      const name = col.name
      let arrowType
      switch (col.type) {
        case "s":
          arrowType = new arrow.Utf8()
          break
        case "d":
          arrowType = new arrow.Timestamp(arrow.TimeUnit.MICROSECOND)
          break
        case "n":
          let isFloat = determineDtype(typedCols[index])
          arrowType = isFloat ? new arrow.Float64() : new arrow.Int64()
          break
        case "j":
          arrowType = new arrow.Utf8()
          break
        default:
          arrowType = new arrow.Utf8()
      }
      columnTypes[name] = arrowType
      // Add column name to the first row of CSV string
      // only run this if index is not the last element
      csvString += name + (index < schema.cols.length - 1 ? delimiter : "\n")
    })

    // Construct the data rows of the CSV string
    typedArrs.forEach((row, rowIndex) => {
      row.forEach((cell: any, cellIndex) => {
        const cellIsNan = Number.isNaN(cell)
        if (schema.cols[cellIndex].type === "d") {
          if (isNaN(cell)) cell = ""
          try {
            cell = (cell as Date).toISOString()
          } catch (error) {
            console.log("Error converting cell to ISO string: ", cell)
            cell = cell.toString()
          }
        }
        csvString +=
          cell !== null && cell !== undefined && !cellIsNan ? cell : ""
        csvString += cellIndex < row.length - 1 ? delimiter : ""
      })
      csvString += rowIndex < typedArrs.length - 1 ? "\n" : "" // New line at the end of each row
    })
    return { columnTypes, csvString, delimiter }
  }

  const processCsvContent = async (csvContent: string, sourceName: string) => {
    if (!db) {
      setJob({
        csvContent,
        sourceName,
      })
      return
    }
    try {
      const c = await db.connect()
      const { columnTypes, csvString, delimiter } =
        parseCsvContentFirstPass(csvContent)

      await db.registerFileText(sourceName, csvString)
      if (cell.query) {
        await c.query(`DROP TABLE "${INPUT_TABLE}"`)
      }
      await c.insertCSVFromPath(sourceName, {
        schema: "main",
        name: INPUT_TABLE,
        delimiter: delimiter,
        columns: columnTypes,
        detect: false,
        header: true,
      })
      await c.close()
      const uploadQuery = uploadQueryBuilder(INPUT_TABLE)
      setCells([{ type: "upload", query: uploadQuery }])
    } catch (error) {
      console.error(
        `Error processing CSV, first pass content from ${sourceName}:`,
        error
      )
      try {
        // Second pass
        const c = await db.connect()
        let sheet = XLSX.read(csvContent, {
          raw: false,
          dense: true,
          type: "string",
        }).Sheets["Sheet1"]
        let jsonRows = XLSX.utils.sheet_to_json(sheet)

        await db.registerFileText(sourceName, JSON.stringify(jsonRows))

        await c.insertJSONFromPath(sourceName, { name: INPUT_TABLE })

        await c.close()
        setRowCount(jsonRows.length)
        const uploadQuery = uploadQueryBuilder(INPUT_TABLE)
        setCells([{ type: "upload", query: uploadQuery }])
      } catch (error) {
        console.error(
          `Error processing CSV, second pass content from ${sourceName}:`,
          error
        )
      }
    }
  }

  const urlCsvUpload = async (url: string) => {
    setIsLoading(true)
    try {
      const response = await axios.get(`https://corsproxy.io/?${url}`)
      const csvContent = response.data
      await processCsvContent(csvContent, "url_file")
    } catch (error) {
      try {
        const response = await axios.get(url)
        const csvContent = response.data
        await processCsvContent(csvContent, "direct_url_file")
      } catch (directError) {
        console.error("Error downloading demo CSV:", directError)
      }
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
    setError(null)
    setIsLoading(true)
    const reader = new FileReader()
    reader.onload = async (e) => {
      let csvContent
      if (file.type.includes("excel") || file.type.includes("spreadsheetml")) {
        const workbook = XLSX.read(e.target?.result, { type: "binary" })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        csvContent = XLSX.utils.sheet_to_csv(worksheet)
      } else if (
        file.type.includes("json") &&
        typeof e.target?.result === "string"
      ) {
        try {
          const jsonContent = JSON.parse(e.target.result)
          const jsonRows = Array.isArray(jsonContent)
            ? jsonContent
            : [jsonContent]
          csvContent = await json2csv(jsonRows, { unwindArrays: true })
        } catch (error) {
          console.error(error)
          setError(`Error loading JSON`)
          setRowCount(0)
          setIsLoading(false)
          return
        }
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
            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, application/json"
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
      <Button
        className="my-4"
        onClick={() => {
          urlCsvUpload(DEMO_CSV_URL)
        }}
      >
        Load Demo CSV
      </Button>
      <br />
      {!!rowCount && <Label>{rowCount} rows loaded</Label>}
      <div className="bg-red-200 font-bold max-w-full">
        {error &&
          error.split("\n").map((line, index) => (
            <span key={index}>
              {line}
              <br />
            </span>
          ))}
      </div>
    </Block>
  )
}
