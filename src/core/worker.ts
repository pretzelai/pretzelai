import { loadPyodide } from "pyodide"

const pyodide = await loadPyodide({
  indexURL: import.meta.env.PROD ? "../pyodide" : "../../public/pyodide",
})

await pyodide.loadPackage(["pandas", "numpy", "micropip", "matplotlib"])

try {
  await pyodide.runPythonAsync(`import pandas as pd
import numpy as np
import micropip
await micropip.install("plotly")
import plotly`)
} catch (e) {
  console.log(e)
}

postMessage("ready")

onmessage = async (event) => {
  try {
    let message = event.data
    if (message.includes(".show()")) {
      message = message.replace(".show()", ".to_html(full_html=False)")
    }
    postMessage(String((await pyodide.runPythonAsync(message)) || ""))
    // "df_output" without "#" before
    if (/^(?!.*#.*df_output).*df_output/gm.test(message)) {
      postMessage(
        "export" + String(await pyodide.runPythonAsync(`df_output.to_csv()`))
      )
    }
  } catch (error: any) {
    postMessage(`Error: ${error.type}`)
  }
}
