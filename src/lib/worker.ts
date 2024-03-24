import { loadPyodide } from "pyodide"

const pyodide = await loadPyodide({
  indexURL: import.meta.env.PROD ? "./pyodide" : "../../public/pyodide",
})
await pyodide.loadPackage("pandas")
await pyodide.loadPackage("numpy")
try {
  await pyodide.runPythonAsync(`import pandas as pd`)
} catch (e) {
  console.log(e)
}

postMessage("ready")

onmessage = async (event) => {
  let result
  if (event.data === "export") {
    result =
      "export" + String(await pyodide.runPythonAsync(`df_output.to_csv()`))
  } else {
    try {
      result = String((await pyodide.runPythonAsync(event.data)) || "")
    } catch (error: any) {
      result = `Error: ${error.type}`
    }
  }
  postMessage(result)
}
