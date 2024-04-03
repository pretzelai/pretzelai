import * as Comlink from 'comlink'

export class FilterRowCount{
    async findFilteredRowCount(
        query:(q:string)=>Promise<{
            rowsJson: any;
            result: any;
        }>,
        q:string
    ){
        const {rowsJson} = await query(q)
        return rowsJson.length
    }
}

Comlink.expose(FilterRowCount)