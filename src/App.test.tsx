import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import type { StocDesktopApi } from './electron'

afterEach(() => {
  cleanup()
  delete window.stocDesktop
})

describe('App', () => {
  it('renders the dashboard scaffold', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Energy Meter Test System' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /connect simulator/i })).toBeInTheDocument()
  })

  it('offers discovered serial ports only when the Electron bridge is present', async () => {
    const openPort = vi.fn(async () => undefined)
    const api: StocDesktopApi = {
      listPorts: vi.fn(async () => [
        { path: 'COM7', manufacturer: 'Proteus' },
        { path: 'COM8' },
      ]),
      openPort,
      closePort: vi.fn(async () => undefined),
      writeSerial: vi.fn(async () => undefined),
      onSerialData: () => () => undefined,
      onSerialError: () => () => undefined,
    }
    window.stocDesktop = api

    render(<App />)

    const selector = await screen.findByRole('combobox', { name: /serial port/i })
    expect(selector).toHaveValue('COM7')
    expect(selector).toHaveTextContent('COM7 — Proteus')
    fireEvent.change(selector, { target: { value: 'COM8' } })
    await screen.getByRole('button', { name: /connect proteus/i }).click()

    await waitFor(() => expect(openPort).toHaveBeenCalledWith('COM8'))
  })
})
