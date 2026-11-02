import { describe, expect, it } from 'vitest'
import { call, createBill, createHome, type Share } from './helpers'

describe('extra robustness and edge cases', () => {
  it('handles concurrent payment attempts on the same share', async () => {
    const { homeId } = await createHome(['Alice', 'Bob'])
    const bill = await createBill(homeId, 1000)
    const share = bill.body.shares[0]
    expect(share).toBeDefined()
    if (!share) return

    const key1 = crypto.randomUUID()
    const key2 = crypto.randomUUID()

    // Send two payments concurrently with different keys
    const [res1, res2] = await Promise.all([
      call<Share>('POST', `/api/bills/${bill.body.id}/shares/${share.id}/pay`, {
        headers: { 'Idempotency-Key': key1 },
      }),
      call<Share>('POST', `/api/bills/${bill.body.id}/shares/${share.id}/pay`, {
        headers: { 'Idempotency-Key': key2 },
      }),
    ])

    const statuses = [res1.status, res2.status].sort()
    // Exactly one must succeed (200) and one must fail (409)
    expect(statuses).toEqual([200, 409])
  })

  it('handles concurrent payment attempts with the SAME idempotency key', async () => {
    const { homeId } = await createHome(['Alice', 'Bob'])
    const bill = await createBill(homeId, 1000)
    const share = bill.body.shares[0]
    expect(share).toBeDefined()
    if (!share) return

    const sharedKey = crypto.randomUUID()

    const [res1, res2] = await Promise.all([
      call<Share>('POST', `/api/bills/${bill.body.id}/shares/${share.id}/pay`, {
        headers: { 'Idempotency-Key': sharedKey },
      }),
      call<Share>('POST', `/api/bills/${bill.body.id}/shares/${share.id}/pay`, {
        headers: { 'Idempotency-Key': sharedKey },
      }),
    ])

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    expect(res1.body.paidAt).toBe(res2.body.paidAt)
  })

  it('rejects payment if shareId belongs to a different bill', async () => {
    const { homeId } = await createHome(['Alice'])
    const bill1 = await createBill(homeId, 1000)
    const bill2 = await createBill(homeId, 2000)

    const share1 = bill1.body.shares[0]
    expect(share1).toBeDefined()
    if (!share1) return

    // Attempt to pay share1 using bill2's ID
    const res = await call<Share>('POST', `/api/bills/${bill2.body.id}/shares/${share1.id}/pay`, {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    })

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: expect.any(String) })
  })

  it('returns 0 outstanding balance for members with no unpaid bills', async () => {
    const { homeId, members } = await createHome(['Alice', 'Bob'])

    const res = await call<{
      balances: Array<{ memberId: string; name: string; outstandingCents: number }>
    }>('GET', `/api/homes/${homeId}/balances`)

    expect(res.status).toBe(200)
    expect(res.body.balances).toEqual([
      { memberId: members[0]?.id, name: 'Alice', outstandingCents: 0 },
      { memberId: members[1]?.id, name: 'Bob', outstandingCents: 0 },
    ])
  })

  it('returns proper error JSON format on invalid inputs', async () => {
    // Empty name home
    const homeRes = await call('POST', '/api/homes', { body: { name: '   ' } })
    expect(homeRes.status).toBe(400)
    expect(homeRes.body).toEqual({ error: expect.any(String) })

    // Non-string title bill
    const { homeId } = await createHome(['Alice'])
    const billRes = await call('POST', `/api/homes/${homeId}/bills`, {
      body: { title: '', totalCents: 500 },
    })
    expect(billRes.status).toBe(422)
    expect(billRes.body).toEqual({ error: expect.any(String) })

    // Float amount
    const floatRes = await call('POST', `/api/homes/${homeId}/bills`, {
      body: { title: 'Groceries', totalCents: 500.5 },
    })
    expect(floatRes.status).toBe(422)
    expect(floatRes.body).toEqual({ error: expect.any(String) })
  })
})
