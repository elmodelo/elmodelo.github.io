import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'

function App() {
    const [data, setData] = useState([])

    useEffect(() => {
        async function fetchData() {
        // Replace 'your_table_name' with a table from your Supabase DB
        const { data, error } = await supabase.from('your_table_name').select('*')
        if (!error) setData(data)
        }
        fetchData()
    }, [])

    return (
        <div style={{ padding: '20px' }}>
            <h1>El Modelo Dashboard</h1>
            <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
    )
}

export default App
