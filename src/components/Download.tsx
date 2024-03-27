import Block from "./ui/Block"
import { useState } from "react"
import { saveAs } from "file-saver"
import { Button } from "./ui/button"
import { useCell } from "../store/useStore"

const mapWithOptionalQuotes = (value: string | number) => {
  if (typeof value === "string" && value.includes(`,`)) {
    return `"${value}"`
  }
  return value
}

export default function Upload({ id }: { id: number }) {
  const { query, prevQuery } = useCell(id)
  const [downloadFileName, setDownloadFileName] =
    useState<string>(`download_file`)

  const handleDownload = async () => {
    const result = (await query(prevQuery)).rowsJson
    const content = result
      .map((row: any) =>
        (Object.values(row) as (string | number)[])
          .map(mapWithOptionalQuotes)
          .join(",")
      )
      .join("\n")
    const headers = Object.keys(result[0]).map(mapWithOptionalQuotes).join(",")
    const outcontent = `${headers}\n${content}`
    const blob = new Blob([outcontent], { type: "text/csv;charset=utf-8;" })
    saveAs(blob, downloadFileName + ".csv")
  }

  return (
    <Block className="mb-4 w-3/4" title="Download CSV">
      <div>
        <input
          type="text"
          className="w-[500px] h-8 p-2 bg-gray-100 border rounded-lg mr-2"
          placeholder="Enter download file name"
          value={downloadFileName}
          onChange={(e) => setDownloadFileName(e.target.value)}
        />
        <Button onClick={handleDownload}>Download</Button>
      </div>
    </Block>
  )
}
