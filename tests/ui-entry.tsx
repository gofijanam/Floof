import React from 'react'
import {MemoryRouter} from 'react-router-dom'
import {renderToString} from 'react-dom/server'
import App from '../src/App'
export {refresh} from '../src/lib/store'
export const renderApp=()=>renderToString(<MemoryRouter><App /></MemoryRouter>)
