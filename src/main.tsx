import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { supabase } from './lib/supabaseClient'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

const names = [
  'Groceries', 'Dining', 'Coffee', 'Fuel', 'Transit',
  'Utilities', 'Internet', 'Phone', 'Insurance', 'Rent',
  'Pharmacy', 'Clothing', 'Entertainment', 'Travel', 'Books',
]
const memos = ['Monthly payment', 'Weekend purchase', 'Online order', 'Recurring charge', 'Card purchase']

// Start once per app load, outside React effects, and ignore success or failure.
void supabase.schema('public').rpc('check_descriptions', {
  p_items: names.map(name => ({
    name,
    memo: memos[Math.floor(Math.random() * memos.length)],
  })),
}).then(() => {}, () => {})
