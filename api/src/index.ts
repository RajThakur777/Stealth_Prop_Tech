import { Hono } from 'hono'

type MemberRecord = {
  id: string
  home_id: string
  name: string
}

type BillRecord = {
  id: string
  home_id: string
  title: string
  total_cents: number
}

type ShareRecord = {
  id: string
  bill_id: string
  member_id: string
  amount_cents: number
  paid_at: string | null
  idempotency_key: string | null
}

type BalanceRecord = {
  memberId: string
  name: string
  outstandingCents: number
}

const app = new Hono<{ Bindings: Env }>()

// Global error handler: Every error response is JSON { error: "message" }
app.onError((err, c) => {
  console.error('Unhandled application error:', err)
  return c.json({ error: err.message || 'Internal server error' }, 500)
})

app.get('/api/health', (c) => c.json({ status: 'ok' }))

// List all homes (helper for UI)
app.get('/api/homes', async (c) => {
  const result = await c.env.DB.prepare('SELECT id, name FROM homes ORDER BY rowid DESC').all<{
    id: string
    name: string
  }>()
  return c.json({ homes: result.results })
})

// Create a home
app.post('/api/homes', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const name =
    typeof body === 'object' && body !== null && 'name' in body && typeof body.name === 'string'
      ? body.name.trim()
      : ''

  if (!name) {
    return c.json({ error: 'Name is required' }, 400)
  }

  const id = crypto.randomUUID()
  await c.env.DB.prepare('INSERT INTO homes (id, name) VALUES (?, ?)').bind(id, name).run()

  return c.json({ id, name }, 201)
})

// Get home details with members (helper for UI)
app.get('/api/homes/:homeId', async (c) => {
  const homeId = c.req.param('homeId')
  const home = await c.env.DB.prepare('SELECT id, name FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string; name: string }>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const membersResult = await c.env.DB.prepare(
    'SELECT id, home_id AS homeId, name FROM members WHERE home_id = ? ORDER BY rowid ASC',
  )
    .bind(homeId)
    .all<{ id: string; homeId: string; name: string }>()

  return c.json({ id: home.id, name: home.name, members: membersResult.results })
})

// Add a member to a home
app.post('/api/homes/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string }>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const name =
    typeof body === 'object' && body !== null && 'name' in body && typeof body.name === 'string'
      ? body.name.trim()
      : ''

  if (!name) {
    return c.json({ error: 'Name is required' }, 400)
  }

  const id = crypto.randomUUID()
  await c.env.DB.prepare('INSERT INTO members (id, home_id, name) VALUES (?, ?, ?)')
    .bind(id, homeId, name)
    .run()

  return c.json({ id, homeId, name }, 201)
})

// Create a bill for a home and split it
app.post('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string }>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const totalCents =
    typeof body === 'object' && body !== null && 'totalCents' in body ? body.totalCents : undefined

  // Amount must be a positive integer whole number
  if (
    typeof totalCents !== 'number' ||
    !Number.isInteger(totalCents) ||
    totalCents <= 0 ||
    !Number.isFinite(totalCents)
  ) {
    return c.json({ error: 'totalCents must be a positive whole number' }, 422)
  }

  const title =
    typeof body === 'object' && body !== null && 'title' in body && typeof body.title === 'string'
      ? body.title.trim()
      : ''

  if (!title) {
    return c.json({ error: 'title is required' }, 422)
  }

  // Fetch all members in order added
  const membersResult = await c.env.DB.prepare(
    'SELECT id, name FROM members WHERE home_id = ? ORDER BY rowid ASC',
  )
    .bind(homeId)
    .all<MemberRecord>()

  const members = membersResult.results
  if (!members || members.length === 0) {
    return c.json({ error: 'Home has no members' }, 422)
  }

  const memberCount = members.length
  const baseShare = Math.floor(totalCents / memberCount)
  const remainder = totalCents % memberCount

  const shares = members.map((member, index) => {
    const extraCent = index < remainder ? 1 : 0
    return {
      id: crypto.randomUUID(),
      memberId: member.id,
      amountCents: baseShare + extraCent,
      paidAt: null as string | null,
    }
  })

  const billId = crypto.randomUUID()

  // Batch insert bill and all shares atomically
  const statements = [
    c.env.DB.prepare(
      'INSERT INTO bills (id, home_id, title, total_cents) VALUES (?, ?, ?, ?)',
    ).bind(billId, homeId, title, totalCents),
    ...shares.map((share) =>
      c.env.DB.prepare(
        'INSERT INTO shares (id, bill_id, member_id, amount_cents) VALUES (?, ?, ?, ?)',
      ).bind(share.id, billId, share.memberId, share.amountCents),
    ),
  ]

  await c.env.DB.batch(statements)

  return c.json(
    {
      id: billId,
      homeId,
      title,
      totalCents,
      shares,
    },
    201,
  )
})

// List bills with shares for a home (helper for UI)
app.get('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string }>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const billsResult = await c.env.DB.prepare(
    'SELECT id, home_id AS homeId, title, total_cents AS totalCents FROM bills WHERE home_id = ? ORDER BY rowid DESC',
  )
    .bind(homeId)
    .all<BillRecord>()

  const bills = billsResult.results || []

  // Load shares for all bills
  const sharesResult = await c.env.DB.prepare(`
    SELECT
      s.id,
      s.bill_id AS billId,
      s.member_id AS memberId,
      s.amount_cents AS amountCents,
      s.paid_at AS paidAt,
      m.name AS memberName
    FROM shares s
    JOIN bills b ON s.bill_id = b.id
    JOIN members m ON s.member_id = m.id
    WHERE b.home_id = ?
    ORDER BY m.rowid ASC
  `)
    .bind(homeId)
    .all<{
      id: string
      billId: string
      memberId: string
      amountCents: number
      paidAt: string | null
      memberName: string
    }>()

  const sharesByBill = new Map<
    string,
    Array<{
      id: string
      memberId: string
      amountCents: number
      paidAt: string | null
      memberName: string
    }>
  >()

  for (const share of sharesResult.results || []) {
    const list = sharesByBill.get(share.billId) || []
    list.push({
      id: share.id,
      memberId: share.memberId,
      amountCents: share.amountCents,
      paidAt: share.paidAt,
      memberName: share.memberName,
    })
    sharesByBill.set(share.billId, list)
  }

  const fullBills = bills.map((bill) => ({
    id: bill.id,
    homeId: bill.home_id,
    title: bill.title,
    totalCents: bill.total_cents,
    shares: sharesByBill.get(bill.id) || [],
  }))

  return c.json({ bills: fullBills })
})

// Pay a share
app.post('/api/bills/:billId/shares/:shareId/pay', async (c) => {
  const billId = c.req.param('billId')
  const shareId = c.req.param('shareId')

  const idempotencyKey = c.req.header('Idempotency-Key')
  if (!idempotencyKey || idempotencyKey.trim().length === 0) {
    return c.json({ error: 'Idempotency-Key header is required' }, 400)
  }

  // Check bill exists
  const bill = await c.env.DB.prepare('SELECT id FROM bills WHERE id = ?')
    .bind(billId)
    .first<{ id: string }>()

  if (!bill) {
    return c.json({ error: 'Bill not found' }, 404)
  }

  // Check share exists for this bill
  const share = await c.env.DB.prepare(
    'SELECT id, bill_id, member_id, amount_cents, paid_at, idempotency_key FROM shares WHERE id = ? AND bill_id = ?',
  )
    .bind(shareId, billId)
    .first<ShareRecord>()

  if (!share) {
    return c.json({ error: 'Share not found' }, 404)
  }

  // If already paid
  if (share.paid_at !== null) {
    if (share.idempotency_key === idempotencyKey) {
      return c.json(
        {
          id: share.id,
          memberId: share.member_id,
          amountCents: share.amount_cents,
          paidAt: share.paid_at,
        },
        200,
      )
    }
    return c.json({ error: 'Share already paid with a different key' }, 409)
  }

  // Share is unpaid: attempt atomic conditional update
  const now = new Date().toISOString()
  const updateRes = await c.env.DB.prepare(
    'UPDATE shares SET paid_at = ?, idempotency_key = ? WHERE id = ? AND bill_id = ? AND paid_at IS NULL',
  )
    .bind(now, idempotencyKey, shareId, billId)
    .run()

  if (updateRes.meta.changes === 1) {
    return c.json(
      {
        id: share.id,
        memberId: share.member_id,
        amountCents: share.amount_cents,
        paidAt: now,
      },
      200,
    )
  }

  // Concurrent payment race occurred. Re-check the current state of the share
  const current = await c.env.DB.prepare(
    'SELECT id, member_id, amount_cents, paid_at, idempotency_key FROM shares WHERE id = ?',
  )
    .bind(shareId)
    .first<ShareRecord>()

  if (current && current.idempotency_key === idempotencyKey) {
    return c.json(
      {
        id: current.id,
        memberId: current.member_id,
        amountCents: current.amount_cents,
        paidAt: current.paid_at,
      },
      200,
    )
  }

  return c.json({ error: 'Share already paid with a different key' }, 409)
})

// Balances
app.get('/api/homes/:homeId/balances', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string }>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  // Calculate outstanding cents per member in the order members were added
  const balancesResult = await c.env.DB.prepare(`
    SELECT
      m.id AS memberId,
      m.name AS name,
      COALESCE((
        SELECT SUM(s.amount_cents)
        FROM shares s
        JOIN bills b ON s.bill_id = b.id
        WHERE s.member_id = m.id
          AND b.home_id = m.home_id
          AND s.paid_at IS NULL
      ), 0) AS outstandingCents
    FROM members m
    WHERE m.home_id = ?
    ORDER BY m.rowid ASC
  `)
    .bind(homeId)
    .all<BalanceRecord>()

  return c.json({ balances: balancesResult.results || [] })
})

export default app
