import { loadPyodide } from "pyodide"

const pyodide = await loadPyodide({
  indexURL: import.meta.env.PROD ? "./pyodide" : "../../public/pyodide",
})
await pyodide.loadPackage("pandas")

postMessage("ready")

onmessage = async (event) => {
  console.log("executing", event.data)
  postMessage(String(await pyodide.runPythonAsync(event.data)))
}
