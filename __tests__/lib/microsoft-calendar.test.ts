import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createEvent, updateEvent, deleteEvent, refreshMicrosoftToken } from '@/lib/calendar/microsoft'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('Microsoft Graph calendar client', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    process.env.MICROSOFT_CLIENT_ID = 'ms-id'
    process.env.MICROSOFT_CLIENT_SECRET = 'ms-secret'
    process.env.MICROSOFT_TENANT_ID = 'common'
  })

  describe('createEvent', () => {
    it('POSTs to Graph /me/events and returns the event ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'ms-evt-456' }),
      })
      const id = await createEvent('tok', {
        title: 'Sprint Review',
        startDate: '2026-05-19',
        endDate: '2026-05-21',
        description: '16 working hours · Fixed task',
      })
      expect(id).toBe('ms-evt-456')
      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toContain('graph.microsoft.com')
      const body = JSON.parse(opts.body as string)
      expect(body.isAllDay).toBe(true)
      // Microsoft uses inclusive end (same date, T23:59:59)
      expect(body.end.dateTime).toBe('2026-05-21T23:59:59')
    })

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 })
      await expect(
        createEvent('bad', { title: '', startDate: '', endDate: '', description: '' })
      ).rejects.toThrow('403')
    })
  })

  describe('updateEvent', () => {
    it('PATCHes the event and returns void', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })
      await updateEvent('tok', 'evt-id', {
        title: 'Updated Task',
        startDate: '2026-05-20',
        endDate: '2026-05-22',
        description: 'Updated',
      })
      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toContain('graph.microsoft.com')
      expect(url).toContain('evt-id')
      expect(opts.method).toBe('PATCH')
      const body = JSON.parse(opts.body as string)
      expect(body.isAllDay).toBe(true)
    })
  })

  describe('deleteEvent', () => {
    it('resolves without throwing for 404', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })
      await expect(deleteEvent('tok', 'missing')).resolves.toBeUndefined()
    })

    it('throws for non-404 error status', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
      await expect(deleteEvent('tok', 'evt-id')).rejects.toThrow('500')
    })
  })

  describe('refreshMicrosoftToken', () => {
    it('exchanges refresh token and returns new access token + expiry', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'new-ms-tok', expires_in: 3600 }),
      })
      const result = await refreshMicrosoftToken('refresh-tok')
      expect(result.accessToken).toBe('new-ms-tok')
      expect(result.expiresAt).toBeInstanceOf(Date)
    })
  })
})
