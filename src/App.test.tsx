import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import type { StocDesktopApi } from './electron'

function createDesktopApi(overrides: Partial<StocDesktopApi> = {}): StocDesktopApi {
  return {
    listPorts: vi.fn(async () => [{ path: 'COM7', manufacturer: 'Proteus' }]),
    openPort: vi.fn(async () => undefined),
    closePort: vi.fn(async () => undefined),
    writeSerial: vi.fn(async () => undefined),
    onSerialData: () => () => undefined,
    onSerialError: () => () => undefined,
    onSerialClose: () => () => undefined,
    ...overrides,
  }
}

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
    const api = createDesktopApi({
      listPorts: vi.fn(async () => [
        { path: 'COM7', manufacturer: 'Proteus' },
        { path: 'COM8' },
      ]),
      openPort,
    })
    window.stocDesktop = api

    render(<App />)

    const selector = await screen.findByRole('combobox', { name: /serial port/i })
    expect(selector).toHaveValue('COM7')
    expect(selector).toHaveTextContent('COM7 — Proteus')
    fireEvent.change(selector, { target: { value: 'COM8' } })
    await screen.getByRole('button', { name: /connect proteus/i }).click()

    await waitFor(() => expect(openPort).toHaveBeenCalledWith('COM8'))
  })

  it('refreshes ports explicitly and again after disconnect', async () => {
    const listPorts = vi.fn()
      .mockResolvedValueOnce([{ path: 'COM7' }])
      .mockResolvedValueOnce([{ path: 'COM8' }])
      .mockResolvedValueOnce([{ path: 'COM9' }])
    window.stocDesktop = createDesktopApi({ listPorts })
    render(<App />)
    const selector = await screen.findByRole('combobox', { name: /serial port/i })
    await screen.getByRole('button', { name: /connect proteus/i }).click()
    await screen.findByRole('button', { name: /disconnect proteus/i })

    await screen.getByRole('button', { name: /disconnect proteus/i }).click()
    await waitFor(() => expect(listPorts).toHaveBeenCalledTimes(2))
    expect(selector).toHaveValue('COM8')
    await screen.getByRole('button', { name: /refresh ports/i }).click()
    await waitFor(() => expect(listPorts).toHaveBeenCalledTimes(3))
    expect(selector).toHaveValue('COM9')
  })

  it('shows port discovery loading and recovers from a scan error', async () => {
    let rejectScan!: (error: Error) => void
    const listPorts = vi.fn()
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectScan = reject }))
      .mockResolvedValueOnce([{ path: 'COM10' }])
    window.stocDesktop = createDesktopApi({ listPorts })
    render(<App />)

    expect(screen.getByRole('status', { name: /port discovery/i })).toHaveTextContent(/scanning/i)
    rejectScan(new Error('Port scan failed'))
    expect(await screen.findByRole('alert', { name: /port discovery error/i })).toHaveTextContent('Port scan failed')
    await screen.getByRole('button', { name: /refresh ports/i }).click()

    await waitFor(() => expect(screen.getByRole('combobox', { name: /serial port/i })).toHaveValue('COM10'))
    expect(screen.queryByRole('alert', { name: /port discovery error/i })).not.toBeInTheDocument()
  })

  it('refreshes ports after opening the selected port fails', async () => {
    const listPorts = vi.fn(async () => [{ path: 'COM7' }])
    window.stocDesktop = createDesktopApi({
      listPorts,
      openPort: vi.fn(async () => { throw new Error('Access denied') }),
    })
    render(<App />)
    await screen.findByRole('combobox', { name: /serial port/i })

    await screen.getByRole('button', { name: /connect proteus/i }).click()

    await waitFor(() => expect(listPorts).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('alert')).toHaveTextContent('Access denied')
  })
})
