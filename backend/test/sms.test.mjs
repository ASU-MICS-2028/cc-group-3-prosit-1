// SMS failover: Nalo first, Arkesel when Nalo refuses or has no key.
import { afterEach, describe, expect, it, vi } from 'vitest'

let secret
vi.mock('../src/secrets.ts', () => ({ optionalSecret: async () => secret }))
const { smsGateway } = await import('../src/integrations.ts')

const json = (body) => new Response(JSON.stringify(body), { status: 200 })
afterEach(() => vi.unstubAllGlobals())

function stub(nalo, arkesel) {
  const fetch = vi.fn(async (url) => (String(url).includes('nalosolutions') ? nalo() : arkesel()))
  vi.stubGlobal('fetch', fetch)
  return fetch
}
const send = () => smsGateway({ smsSecretArn: 'arn' }).send('+233241234567', 'code 123456')
const both = { nalo_key: 'n', nalo_sender_id: 'WSB', api_key: 'a', sender_id: 'AGRO' }

describe('smsGateway', () => {
  it('stops at Nalo when it accepts', async () => {
    secret = both
    const fetch = stub(() => json({ status: '1701' }), () => json({ status: 'success' }))
    await send()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ key: 'n', sender_id: 'WSB', msisdn: '233241234567' })
  })

  it('falls back to Arkesel when Nalo refuses', async () => {
    secret = both
    const fetch = stub(() => json({ status: '1025' }), () => json({ status: 'success' }))
    await send()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('uses Arkesel alone when there is no Nalo key', async () => {
    secret = { api_key: 'a', sender_id: 'AGRO' }
    const fetch = stub(() => json({ status: '1701' }), () => json({ status: 'success' }))
    await send()
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual(['https://sms.arkesel.com/api/v2/sms/send'])
  })

  it('answers 503 when both refuse', async () => {
    secret = both
    stub(() => json({ status: '1710' }), () => Promise.reject(new Error('down')))
    await expect(send()).rejects.toMatchObject({ status: 503 })
  })
})
