import { useEffect, useState, useRef, SetStateAction } from "react"
import ReactECharts from "echarts-for-react"
import { EChartOption, registerTheme } from "echarts"
import { AsyncDuckDB } from "../lib/duckdb"
import { query } from "../lib/utils"
import { Resizable } from "react-resizable"
// import * as eChartsConfig from "../lib/echartsConfig.js"
import eChartsTheme from "../lib/eChartsTheme.json"

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectScrollUpButton,
  SelectScrollDownButton,
  SelectGroup,
} from "./ui/select"

import { Button } from "./ui/button" // Modified to include Input
import { Input } from "./ui/input"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"

import "react-resizable/css/styles.css"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"

type ChartType = "line" | "bar" | "scatter"

interface ChartData {
  columns: string[]
  data: Record<string, string>[]
}

export default function Chart({
  db,
  updateQuery,
  prevQuery,
}: {
  db: AsyncDuckDB | null
  updateQuery: (q: string) => void
  prevQuery: string
}) {
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [chartType, setChartType] = useState<ChartType>("line")
  const [xAxisColumn, setXAxisColumn] = useState("")
  const [yAxisColumns, setYAxisColumns] = useState<string[]>([])
  const [barChartType, setBarChartType] = useState<string>("grouped")
  const [option, setOption] = useState<EChartOption | null>(null)
  const [chartTitle, setChartTitle] = useState("") // Added for chart title input
  const [xAxisLabel, setXAxisLabel] = useState("") // Added for X axis label input
  const [yAxisLabel, setYAxisLabel] = useState("") // Added for Y axis label input
  const echartRef = useRef(null)
  const [chartHeight, setChartHeight] = useState(500)

  const toggleYAxis = (col: string) => {
    setYAxisColumns((prev: string[]) => {
      if (prev.includes(col)) {
        return prev.filter((item) => item !== col)
      } else {
        return [...prev, col]
      }
    })
  }

  useEffect(() => {
    if (db) {
      const fetch = async () => {
        if (prevQuery) {
          const { rowsJson } = await query(db, prevQuery)
          if (rowsJson?.[0]) {
            const columns = Object.keys(rowsJson[0])
            setChartData({ columns, data: rowsJson })
            updateQuery(prevQuery)
          }
        }
      }
      fetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, prevQuery])

  useEffect(() => {
    if (chartData && chartData.data.length) {
      registerTheme("infographic", eChartsTheme)
      const opt: EChartOption = {
        title: {
          text: chartTitle, // Modified to use chartTitle state
        },
        tooltip: {
          trigger: "axis",
          axisPointer: {
            type: "cross",
            label: {
              backgroundColor: "#6a7985",
            },
          },
        },
        grid: {
          // Adjusting grid to prevent labels from being cut-off
          bottom: "20%", // Increase bottom margin to accommodate rotated labels
        },
        xAxis: {
          name: xAxisLabel || xAxisColumn, // Modified to use xAxisLabel state or default to xAxisColumn if empty
          data: chartData.data.map((item) => item[xAxisColumn]),
          axisLabel: {
            rotate: 45,
            interval: (index: number, value: string) => {
              // Display a sampling of labels when there are too many, otherwise display all
              const totalLabels = chartData.data.length
              if (totalLabels > 50 && totalLabels <= 75) {
                return index % 5 === 0
              } else if (totalLabels > 75 && totalLabels <= 100) {
                return index % 10 === 0
              } else if (totalLabels > 100 && totalLabels <= 125) {
                return index % 15 === 0
              } else if (totalLabels > 125 && totalLabels <= 150) {
                return index % 20 === 0
              } else if (totalLabels > 150 && totalLabels <= 200) {
                return index % 25 === 0
              } else if (totalLabels > 200 && totalLabels <= 300) {
                return index % 30 === 0
              } else if (totalLabels > 300 && totalLabels <= 500) {
                return index % 40 === 0
              } else if (totalLabels > 500) {
                return index % 50 === 0
              }
              return true
            },
          },
        },
        yAxis: {
          name: yAxisLabel || yAxisColumns.join(", "),
          axisPointer: {
            label: {
              show: true,
            },
          },
        },
        legend: {
          show: yAxisColumns.length > 1, // Show legend when multiple y-axes are set
          data: yAxisColumns,
          orient: "vertical", // Orient legend vertically
          right: "right", // Position legend on the right side
        },
        series: [],
        animation: false,
      }
      if (chartType === "line" || chartType === "scatter") {
        yAxisColumns.forEach((yAxisColumn) => {
          const seriesData = chartData.data.map((item) =>
            parseFloat(item[yAxisColumn])
          )
          const seriesOption: {
            name: string
            type: "line" | "scatter"
            data: number[]
            showSymbol?: boolean // Add this line
          } = {
            name: yAxisColumn,
            type: chartType,
            data: seriesData,
          }
          if (chartType === "line" && chartData.data.length > 20) {
            seriesOption.showSymbol = false
          }
          opt.series?.push(seriesOption)
        })
      } else if (chartType === "bar") {
        yAxisColumns.forEach((yAxisColumn) => {
          const seriesData = chartData.data.map((item) =>
            parseFloat(item[yAxisColumn])
          )
          opt.series?.push({
            name: yAxisColumn,
            type: "bar",
            stack: barChartType === "stacked" ? "total" : undefined,
            data: seriesData,
          })
        })
      }
      setOption(opt)
    }
  }, [
    chartData,
    chartType,
    barChartType,
    xAxisColumn,
    yAxisColumns,
    chartTitle,
    xAxisLabel,
    yAxisLabel,
  ])

  const downloadChart = () => {
    if (echartRef.current) {
      // @ts-ignore
      const echartInstance = echartRef.current.getEchartsInstance()
      const url = echartInstance.getDataURL({
        type: "png",
        pixelRatio: 2,
        backgroundColor: "#fff",
      })
      const link = document.createElement("a")
      link.href = url
      link.download = `chart-${new Date().toISOString()}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  return (
    <Card className="mb-4 w-full">
      <CardHeader>
        <CardTitle>Chart</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="w-full mr-2">
          <div className="flex flex-row flex-nowrap gap-4">
            <div className="flex flex-col flex-none gap-4 justify-center">
              <div className="flex flex-col">
                <label className="text-xs">Chart Title</label>
                <Input
                  value={chartTitle}
                  onChange={(e: {
                    target: { value: SetStateAction<string> }
                  }) => setChartTitle(e.target.value)}
                  placeholder="Enter chart title"
                />{" "}
              </div>
              <div className="flex flex-col">
                <label className="text-xs">X-Axis Label</label>
                <Input
                  value={xAxisLabel}
                  onChange={(e: {
                    target: { value: SetStateAction<string> }
                  }) => setXAxisLabel(e.target.value)}
                  placeholder="Enter X-axis label"
                />{" "}
              </div>
              <div className="flex flex-col">
                <label className="text-xs">Y-Axis Label</label>
                <Input
                  value={yAxisLabel}
                  onChange={(e: {
                    target: { value: SetStateAction<string> }
                  }) => setYAxisLabel(e.target.value)}
                  placeholder="Enter Y-axis label"
                />{" "}
              </div>
            </div>

            {/* left panel column start */}
            <div className="flex flex-col flex-1 gap-4">
              <div className="flex flex-row gap-4 justify-center">
                <div className="flex flex-col">
                  <label className="text-xs">Chart Type</label>
                  {/* @ts-ignore */}
                  <Select defaultValue={chartType} onValueChange={setChartType}>
                    <SelectTrigger aria-label="Chart Type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectScrollUpButton />
                      <SelectGroup>
                        <SelectItem value="line">Line</SelectItem>
                        <SelectItem value="bar">Bar</SelectItem>
                        <SelectItem value="scatter">Scatter</SelectItem>
                      </SelectGroup>
                      <SelectScrollDownButton />
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs">X-Axis Column</label>
                  <Select
                    defaultValue={xAxisColumn}
                    onValueChange={setXAxisColumn}
                  >
                    <SelectTrigger aria-label="X-Axis Column">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectScrollUpButton />
                      <SelectGroup>
                        {chartData?.columns.map((column) => (
                          <SelectItem key={column} value={column}>
                            {column}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectScrollDownButton />
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs">Y-Axis Columns</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline">
                        {yAxisColumns.join(", ").length > 25
                          ? `${yAxisColumns.join(", ").substring(0, 25)}...`
                          : yAxisColumns.join(", ")}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56">
                      {chartData?.columns.map((column) => (
                        <DropdownMenuCheckboxItem
                          checked={yAxisColumns.includes(column)}
                          onCheckedChange={() => toggleYAxis(column)}
                        >
                          {column}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {chartType === "bar" && (
                  <div className="flex flex-col">
                    <label className="text-xs">Bar Chart Type</label>
                    <Select
                      defaultValue={barChartType}
                      onValueChange={setBarChartType}
                    >
                      <SelectTrigger aria-label="Bar Chart Type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectScrollUpButton />
                        <SelectGroup>
                          <SelectItem value="grouped">Grouped</SelectItem>
                          <SelectItem value="stacked">Stacked</SelectItem>
                        </SelectGroup>
                        <SelectScrollDownButton />
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {echartRef.current && (
                  <div className="flex flex-col">
                    <label className="text-xs">Download PNG</label>
                    <Button variant="outline" onClick={downloadChart}>
                      <svg
                        className="w-8 h-8 text-gray-800 dark:text-white"
                        aria-hidden="true"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          fillRule="evenodd"
                          d="M13 11.1V4a1 1 0 1 0-2 0v7.1L8.8 8.4a1 1 0 1 0-1.6 1.2l4 5a1 1 0 0 0 1.6 0l4-5a1 1 0 1 0-1.6-1.2L13 11Z"
                          clipRule="evenodd"
                        />
                        <path
                          fillRule="evenodd"
                          d="M9.7 15.9 7.4 13H5a2 2 0 0 0-2 2v4c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-2.4l-2.3 2.9a3 3 0 0 1-4.6 0Zm7.3.1a1 1 0 1 0 0 2 1 1 0 1 0 0-2Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </Button>
                  </div>
                )}
              </div>
              <Resizable
                height={chartHeight}
                width={Infinity}
                resizeHandles={["s"]} // Add 'e' and 'se' to allow resizing horizontally and diagonally
                onResize={(event, { size }) => {
                  setChartHeight(size.height)
                }}
              >
                <div
                  style={{ height: chartHeight, width: "100%" }} // Apply both height and width
                  className="w-full border"
                >
                  {xAxisColumn && yAxisColumns.length > 0 && (
                    <ReactECharts
                      ref={echartRef}
                      key={Math.random()} // Consider removing this if not necessary, as it forces re-render
                      option={option}
                      style={{ height: "100%", width: "100%" }} // Ensure ECharts fills the container
                      theme="infographic"
                    />
                  )}
                </div>
              </Resizable>
            </div>
            {/* left panel column end */}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
