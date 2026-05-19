import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createEvent, updateEvent, deleteEvent, refreshGoogleToken } from '@/lib/calendar/google'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('Google Calendar client', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    process.env.GOOGLE_CLIENT_ID = 'test-id'
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret'
  })

  describe('createEvent', () => {
    it('POSTs to primary calendar and returns the event ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'google-evt-123' }),
      })
      const id = await createEvent('tok', {
        title: 'Sprint Review',
        startDate: '2026-05-19',
        endDate: '2026-05-21',
        description: '16 working hours · Fixed task',
      })
      expect(id).toBe('google-evt-123')
      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toContain('/calendars/primary/events')
      // Google requires exclusive end: 2026-05-22
      expect(JSON.parse(opts.body as string).end.date).toBe('2026-05-22')
    })

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })
      await expect(
        createEvent('bad', {
          title: 'Test',
          startDate: '2026-05-19',
          endDate: '2026-05-20',
          description: 'test',
        })
      ).rejects.toThrow('401')
    })
  })

  describe('updateEvent', () => {
    it('PATCHes the event and handles exclusive end date', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })
      await updateEvent('tok', 'evt-123', {
        title: 'Updated Task',
        startDate: '2026-05-20',
        endDate: '2026-05-23',
        description: 'Updated description',
      })
      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toContain('/calendars/primary/events/evt-123')
      expect(opts.method).toBe('PATCH')
      expect(JSON.parse(opts.body as string).end.date).toBe('2026-05-24')
    })

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
      await expect(
        updateEvent('tok', 'evt-id', {
          title: 'Test',
          startDate: '2026-05-19',
          endDate: '2026-05-20',
          description: 'test',
        })
      ).rejects.toThrow('500')
    })
  })

  describe('deleteEvent', () => {
    it('resolves without throwing for 404 (already deleted)', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })
      await expect(deleteEvent('tok', 'missing')).resolves.toBeUndefined()
    })

    it('throws for non-404 error status', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
      await expect(deleteEvent('tok', 'evt-id')).rejects.toThrow('500')
    })
  })

  describe('refreshGoogleToken', () => {
    it('exchanges refresh token and returns new access token + expiry', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'new-tok', expires_in: 3600 }),
      })
      const result = await refreshGoogleToken('refresh-tok')
      expect(result.accessToken).toBe('new-tok')
      expect(result.expiresAt).toBeInstanceOf(Date)
    })

    it('throws on token refresh failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })
      await expect(refreshGoogleToken('bad-tok')).rejects.toThrow('401')
    })
  })
})
