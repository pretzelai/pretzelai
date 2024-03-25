import { loadPyodide } from "pyodide"

const pyodide = await loadPyodide({
  indexURL: import.meta.env.PROD ? "../pyodide" : "../../public/pyodide",
})
await Promise.all([pyodide.loadPackage("pandas"), pyodide.loadPackage("numpy")])
try {
  await pyodide.runPythonAsync(`import pandas as pd`)
} catch (e) {
  console.log(e)
}

postMessage("ready")

onmessage = async (event) => {
  try {
    postMessage(String((await pyodide.runPythonAsync(event.data)) || ""))
    // "df_output" without "#" before
    if (/^(?!.*#.*df_output).*df_output/gm.test(event.data)) {
      postMessage(
        "export" + String(await pyodide.runPythonAsync(`df_output.to_csv()`))
      )
    }
  } catch (error: any) {
    postMessage(`Error: ${error.type}`)
  }
}
