import * as Comlink from 'comlink'

export class MyClass{
    async logSomething(query:any,q:any){
        console.log("Hello")
        const {rowsJson} = await query(q)
        const filterRowCount = rowsJson.length
        console.log(filterRowCount);
        
        return filterRowCount
    }
}

Comlink.expose(MyClass)