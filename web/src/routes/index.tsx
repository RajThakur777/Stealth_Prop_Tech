import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'

export const Route = createFileRoute('/')({
  component: BillSplitterApp,
})

type Home = {
  id: string
  name: string
}

type Member = {
  id: string
  homeId: string
  name: string
}

type Share = {
  id: string
  memberId: string
  amountCents: number
  paidAt: string | null
  memberName?: string
}

type Bill = {
  id: string
  homeId: string
  title: string
  totalCents: number
  shares: Share[]
}

type Balance = {
  memberId: string
  name: string
  outstandingCents: number
}

function formatCents(cents: number): string {
  const dollars = (cents / 100).toFixed(2)
  return `$${dollars}`
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString)
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

function BillSplitterApp() {
  const [homes, setHomes] = useState<Home[]>([])
  const [selectedHomeId, setSelectedHomeId] = useState<string>('')
  const [members, setMembers] = useState<Member[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [balances, setBalances] = useState<Balance[]>([])

  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [successToast, setSuccessToast] = useState<string | null>(null)

  // Tracking in-flight payment share IDs
  const [payingShareIds, setPayingShareIds] = useState<Record<string, boolean>>({})

  // Modals state
  const [showCreateHome, setShowCreateHome] = useState<boolean>(false)
  const [showAddMember, setShowAddMember] = useState<boolean>(false)
  const [showCreateBill, setShowCreateBill] = useState<boolean>(false)

  // Form states
  const [newHomeName, setNewHomeName] = useState<string>('')
  const [newMemberName, setNewMemberName] = useState<string>('')
  const [newBillTitle, setNewBillTitle] = useState<string>('')
  const [newBillAmountDollars, setNewBillAmountDollars] = useState<string>('')
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false)
  const [modalError, setModalError] = useState<string | null>(null)

  const homeSelectId = useId()
  const homeNameInputId = useId()
  const memberNameInputId = useId()
  const billTitleInputId = useId()
  const billAmountInputId = useId()

  const showToast = useCallback((msg: string) => {
    setSuccessToast(msg)
    setTimeout(() => {
      setSuccessToast(null)
    }, 4000)
  }, [])

  // Fetch homes list
  const loadHomes = useCallback(async () => {
    try {
      const res = await fetch('/api/homes')
      if (!res.ok) {
        throw new Error('Failed to load homes')
      }
      const data = (await res.json()) as { homes: Home[] }
      setHomes(data.homes || [])
      if (data.homes && data.homes.length > 0 && !selectedHomeId) {
        setSelectedHomeId(data.homes[0]?.id || '')
      }
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Error loading homes')
    }
  }, [selectedHomeId])

  // Fetch data for selected home
  const loadHomeData = useCallback(async (homeId: string) => {
    if (!homeId) {
      setMembers([])
      setBills([])
      setBalances([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setPageError(null)

    try {
      // Parallel requests for home details, bills, and balances
      const [homeRes, billsRes, balancesRes] = await Promise.all([
        fetch(`/api/homes/${homeId}`),
        fetch(`/api/homes/${homeId}/bills`),
        fetch(`/api/homes/${homeId}/balances`),
      ])

      if (!homeRes.ok) {
        const errorData = (await homeRes.json().catch(() => ({}))) as { error?: string }
        throw new Error(errorData.error || 'Failed to fetch home details')
      }
      const homeData = (await homeRes.json()) as { id: string; name: string; members: Member[] }
      setMembers(homeData.members || [])

      if (billsRes.ok) {
        const billsData = (await billsRes.json()) as { bills: Bill[] }
        setBills(billsData.bills || [])
      }

      if (balancesRes.ok) {
        const balancesData = (await balancesRes.json()) as { balances: Balance[] }
        setBalances(balancesData.balances || [])
      }
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Failed to load home data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    loadHomes()
  }, [loadHomes])

  // Home change load
  useEffect(() => {
    if (selectedHomeId) {
      loadHomeData(selectedHomeId)
    }
  }, [selectedHomeId, loadHomeData])

  // Handle Home Creation
  const handleCreateHome = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newHomeName.trim()) {
      setModalError('Home name cannot be empty')
      return
    }

    setFormSubmitting(true)
    setModalError(null)

    try {
      const res = await fetch('/api/homes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newHomeName.trim() }),
      })

      const data = (await res.json()) as { id?: string; name?: string; error?: string }
      if (!res.ok || !data.id) {
        throw new Error(data.error || 'Failed to create home')
      }

      setHomes((prev) => [data as Home, ...prev])
      setSelectedHomeId(data.id)
      setNewHomeName('')
      setShowCreateHome(false)
      showToast(`Created home "${data.name}"!`)
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Error creating home')
    } finally {
      setFormSubmitting(false)
    }
  }

  // Handle Member Creation
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMemberName.trim()) {
      setModalError('Member name cannot be empty')
      return
    }

    setFormSubmitting(true)
    setModalError(null)

    try {
      const res = await fetch(`/api/homes/${selectedHomeId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newMemberName.trim() }),
      })

      const data = (await res.json()) as {
        id?: string
        homeId?: string
        name?: string
        error?: string
      }
      if (!res.ok || !data.id) {
        throw new Error(data.error || 'Failed to add member')
      }

      setNewMemberName('')
      setShowAddMember(false)
      showToast(`Added ${data.name} to the home!`)
      loadHomeData(selectedHomeId)
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Error adding member')
    } finally {
      setFormSubmitting(false)
    }
  }

  // Calculated split preview for the bill creation dialog
  const calculatedSplit = useMemo(() => {
    const rawVal = Number.parseFloat(newBillAmountDollars)
    if (Number.isNaN(rawVal) || rawVal <= 0 || members.length === 0) {
      return null
    }

    const totalCents = Math.round(rawVal * 100)
    const count = members.length
    const baseShare = Math.floor(totalCents / count)
    const remainder = totalCents % count

    return members.map((m, index) => {
      const extra = index < remainder ? 1 : 0
      return {
        name: m.name,
        amountCents: baseShare + extra,
      }
    })
  }, [newBillAmountDollars, members])

  // Handle Bill Creation
  const handleCreateBill = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBillTitle.trim()) {
      setModalError('Bill title is required')
      return
    }

    const dollarVal = Number.parseFloat(newBillAmountDollars)
    if (Number.isNaN(dollarVal) || dollarVal <= 0) {
      setModalError('Amount must be a positive number')
      return
    }

    const totalCents = Math.round(dollarVal * 100)
    if (!Number.isInteger(totalCents) || totalCents <= 0) {
      setModalError('Amount must be valid positive cents')
      return
    }

    if (members.length === 0) {
      setModalError('Cannot create a bill for a home with no members.')
      return
    }

    setFormSubmitting(true)
    setModalError(null)

    try {
      const res = await fetch(`/api/homes/${selectedHomeId}/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newBillTitle.trim(),
          totalCents,
        }),
      })

      const data = (await res.json()) as { id?: string; error?: string }
      if (!res.ok || !data.id) {
        throw new Error(data.error || 'Failed to create bill')
      }

      setNewBillTitle('')
      setNewBillAmountDollars('')
      setShowCreateBill(false)
      showToast('Bill created and split successfully!')
      loadHomeData(selectedHomeId)
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Error creating bill')
    } finally {
      setFormSubmitting(false)
    }
  }

  // Handle Paying a Share
  const handlePayShare = async (billId: string, shareId: string, memberName: string) => {
    // Generate fresh idempotency key
    const idempotencyKey = crypto.randomUUID()

    setPayingShareIds((prev) => ({ ...prev, [shareId]: true }))
    setPaymentError(null)

    try {
      const res = await fetch(`/api/bills/${billId}/shares/${shareId}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
      })

      const data = (await res.json().catch(() => ({}))) as {
        id?: string
        paidAt?: string
        error?: string
      }

      if (!res.ok || !data.paidAt) {
        // Payment failed: MUST keep share unpaid and show clear error
        throw new Error(data.error || `Payment failed with status ${res.status}`)
      }

      // Update share locally to paid
      setBills((prevBills) =>
        prevBills.map((b) => {
          if (b.id !== billId) return b
          return {
            ...b,
            shares: b.shares.map((s) =>
              s.id === shareId ? { ...s, paidAt: data.paidAt || null } : s,
            ),
          }
        }),
      )

      showToast(`Share for ${memberName} paid successfully!`)

      // Refresh balances in the background
      const balRes = await fetch(`/api/homes/${selectedHomeId}/balances`)
      if (balRes.ok) {
        const balData = (await balRes.json()) as { balances: Balance[] }
        setBalances(balData.balances || [])
      }
    } catch (err) {
      // Failure keeps share unpaid and sets prominent error state
      const errMsg =
        err instanceof Error ? err.message : 'An unexpected error occurred during payment.'
      setPaymentError(`Failed to pay share for ${memberName}: ${errMsg}`)
    } finally {
      setPayingShareIds((prev) => ({ ...prev, [shareId]: false }))
    }
  }

  // Quick Demo Seeder
  const handleSeedDemo = async () => {
    setIsLoading(true)
    setPageError(null)

    try {
      // 1. Create home
      const homeRes = await fetch('/api/homes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '221B Baker St' }),
      })
      const home = (await homeRes.json()) as { id: string }
      if (!home.id) throw new Error('Could not create demo home')

      // 2. Add members
      const membersToCreate = ['Sherlock Holmes', 'Dr. John Watson', 'Mrs. Hudson']
      for (const name of membersToCreate) {
        await fetch(`/api/homes/${home.id}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        })
      }

      // 3. Create demo bills
      await fetch(`/api/homes/${home.id}/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Quarterly Rent', totalCents: 300000 }), // $3,000.00
      })

      await fetch(`/api/homes/${home.id}/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Gas & Firewood', totalCents: 1000 }), // $10.00 -> 334, 333, 333
      })

      await loadHomes()
      setSelectedHomeId(home.id)
      showToast('Demo home "221B Baker St" created!')
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Failed to seed demo home')
    } finally {
      setIsLoading(false)
    }
  }

  const selectedHome = homes.find((h) => h.id === selectedHomeId)

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <header className="app-header">
        <div className="brand-wrapper">
          <div className="brand-logo-icon">⚖️</div>
          <div>
            <h1 className="brand-title">SplitEase</h1>
            <p className="brand-subtitle">Fair & Safe Shared Bill Splitter</p>
          </div>
        </div>

        <div className="header-controls">
          {homes.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label
                htmlFor={homeSelectId}
                style={{ fontSize: '13px', color: 'var(--text-secondary)' }}
              >
                Home:
              </label>
              <select
                id={homeSelectId}
                className="home-select"
                value={selectedHomeId}
                onChange={(e) => setSelectedHomeId(e.target.value)}
              >
                {homes.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setModalError(null)
              setShowCreateHome(true)
            }}
          >
            + New Home
          </button>
        </div>
      </header>

      {/* Global Page Error Banner */}
      {pageError && (
        <div className="error-banner" role="alert">
          <span className="error-banner-icon">⚠️</span>
          <div className="error-banner-content">
            <strong>Error:</strong> {pageError}
          </div>
          <button
            type="button"
            className="close-btn"
            onClick={() => setPageError(null)}
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* Payment Error Banner */}
      {paymentError && (
        <div className="error-banner" role="alert">
          <span className="error-banner-icon">💳</span>
          <div className="error-banner-content">
            <strong>Payment Issue:</strong> {paymentError}
            <div style={{ fontSize: '11px', opacity: 0.9, marginTop: '2px' }}>
              The share remains unpaid. You may safely retry when ready.
            </div>
          </div>
          <button
            type="button"
            className="close-btn"
            onClick={() => setPaymentError(null)}
            aria-label="Dismiss payment error"
          >
            ✕
          </button>
        </div>
      )}

      {/* Zero Homes Empty State */}
      {!isLoading && homes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🏡</div>
          <h2 className="empty-state-title">No Homes Found</h2>
          <p className="empty-state-text">
            Start by creating a shared home, or load our instant demo dataset with roommates and
            sample bills.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setModalError(null)
                setShowCreateHome(true)
              }}
            >
              + Create Home
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleSeedDemo}>
              ⚡ Quick Demo Setup
            </button>
          </div>
        </div>
      ) : (
        /* Main Dashboard Grid */
        <div className="dashboard-grid">
          {/* Left Column: Balances & Members */}
          <aside>
            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">
                    <span className="card-title-icon">👥</span>
                    Members & Balances
                  </h2>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {selectedHome ? selectedHome.name : 'Selected Home'}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setModalError(null)
                    setShowAddMember(true)
                  }}
                  title="Add a new roommate"
                >
                  + Member
                </button>
              </div>

              {isLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="skeleton" style={{ height: '56px', width: '100%' }} />
                  <div className="skeleton" style={{ height: '56px', width: '100%' }} />
                  <div className="skeleton" style={{ height: '56px', width: '100%' }} />
                </div>
              ) : members.length === 0 ? (
                <div className="empty-state" style={{ padding: '24px 16px' }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>👤</div>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>
                    No members yet
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                    Bills are split among members in order of joining.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setModalError(null)
                      setShowAddMember(true)
                    }}
                  >
                    + Add First Member
                  </button>
                </div>
              ) : (
                <div className="member-list">
                  {balances.map((b, idx) => (
                    <div key={b.memberId} className="member-item">
                      <div className="member-info">
                        <div className="member-avatar">{b.name.charAt(0).toUpperCase()}</div>
                        <div>
                          <div className="member-name">{b.name}</div>
                          <div className="member-order">Order #{idx + 1}</div>
                        </div>
                      </div>
                      <div className="member-balance">
                        <div
                          className={`balance-amount ${b.outstandingCents > 0 ? 'unpaid' : 'settled'}`}
                        >
                          {formatCents(b.outstandingCents)}
                        </div>
                        <span
                          className={`badge ${b.outstandingCents > 0 ? 'badge-owing' : 'badge-settled'}`}
                        >
                          {b.outstandingCents > 0 ? 'Owes' : 'Settled'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>

          {/* Right Column: Bills & Shares */}
          <main>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em' }}>
                  Bills & Share Splitting
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Total {bills.length} {bills.length === 1 ? 'bill' : 'bills'}
                </p>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                disabled={members.length === 0}
                onClick={() => {
                  setModalError(null)
                  setShowCreateBill(true)
                }}
                title={
                  members.length === 0
                    ? 'Add members first before creating bills'
                    : 'Split a new bill'
                }
              >
                + New Bill
              </button>
            </div>

            {isLoading ? (
              <div className="bills-container">
                <div className="skeleton" style={{ height: '180px', width: '100%' }} />
                <div className="skeleton" style={{ height: '180px', width: '100%' }} />
              </div>
            ) : bills.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🧾</div>
                <h3 className="empty-state-title">No Bills Added Yet</h3>
                <p className="empty-state-text">
                  {members.length === 0
                    ? 'Add roommates to this home first, then create a bill to see it split automatically.'
                    : 'Split a bill among all members. Any indivisible cents go sequentially to members in the order they joined.'}
                </p>
                {members.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setModalError(null)
                      setShowCreateBill(true)
                    }}
                  >
                    + Create First Bill
                  </button>
                )}
              </div>
            ) : (
              <div className="bills-container">
                {bills.map((bill) => {
                  const paidCount = bill.shares.filter((s) => s.paidAt !== null).length
                  const totalShares = bill.shares.length
                  const percentPaid =
                    totalShares > 0 ? Math.round((paidCount / totalShares) * 100) : 0

                  return (
                    <article key={bill.id} className="bill-card">
                      <div className="bill-card-header">
                        <div>
                          <h3 className="bill-title">{bill.title}</h3>
                          <div className="bill-meta">
                            {paidCount} of {totalShares} shares paid ({percentPaid}%)
                          </div>
                        </div>
                        <div className="bill-total-tag">
                          <div className="bill-total-label">Total Amount</div>
                          <div className="bill-total-val">{formatCents(bill.totalCents)}</div>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="progress-bar-bg" aria-hidden="true">
                        <div className="progress-bar-fill" style={{ width: `${percentPaid}%` }} />
                      </div>

                      {/* Shares Grid */}
                      <div className="shares-grid">
                        {bill.shares.map((share) => {
                          const isPaid = share.paidAt !== null
                          const isPaying = !!payingShareIds[share.id]
                          const member = members.find((m) => m.id === share.memberId)
                          const memberDisplayName = share.memberName || member?.name || 'Member'

                          return (
                            <div key={share.id} className={`share-pill ${isPaid ? 'is-paid' : ''}`}>
                              <div>
                                <div className="share-member-name">{memberDisplayName}</div>
                                <div className="share-amount-text">
                                  {formatCents(share.amountCents)}
                                </div>
                              </div>

                              <div className="share-status-col">
                                {isPaid ? (
                                  <>
                                    <span className="badge badge-paid">✓ Paid</span>
                                    {share.paidAt && (
                                      <span className="share-timestamp">
                                        {formatDate(share.paidAt)}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn btn-success btn-sm"
                                    disabled={isPaying}
                                    onClick={() =>
                                      handlePayShare(bill.id, share.id, memberDisplayName)
                                    }
                                    title="Pay this member share idempotently"
                                  >
                                    {isPaying ? (
                                      <>
                                        <span className="spinner" /> Paying...
                                      </>
                                    ) : (
                                      'Pay Share'
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </main>
        </div>
      )}

      {/* Modal: Create Home */}
      {showCreateHome && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-home-title"
        >
          <div className="modal-content">
            <div className="modal-header">
              <h3 id="create-home-title" className="modal-title">
                Create a New Home
              </h3>
              <button type="button" className="close-btn" onClick={() => setShowCreateHome(false)}>
                ✕
              </button>
            </div>

            {modalError && (
              <div className="error-banner" style={{ marginBottom: '16px' }}>
                <span>⚠️ {modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateHome}>
              <div className="form-group">
                <label htmlFor={homeNameInputId} className="form-label">
                  Home / Flat Name
                </label>
                <input
                  id={homeNameInputId}
                  type="text"
                  className="form-input"
                  placeholder="e.g. Flat 4B, 221B Baker St"
                  value={newHomeName}
                  onChange={(e) => setNewHomeName(e.target.value)}
                  disabled={formSubmitting}
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateHome(false)}
                  disabled={formSubmitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={formSubmitting}>
                  {formSubmitting ? 'Creating...' : 'Create Home'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Member */}
      {showAddMember && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-member-title"
        >
          <div className="modal-content">
            <div className="modal-header">
              <h3 id="add-member-title" className="modal-title">
                Add Roommate
              </h3>
              <button type="button" className="close-btn" onClick={() => setShowAddMember(false)}>
                ✕
              </button>
            </div>

            {modalError && (
              <div className="error-banner" style={{ marginBottom: '16px' }}>
                <span>⚠️ {modalError}</span>
              </div>
            )}

            <form onSubmit={handleAddMember}>
              <div className="form-group">
                <label htmlFor={memberNameInputId} className="form-label">
                  Member Name
                </label>
                <input
                  id={memberNameInputId}
                  type="text"
                  className="form-input"
                  placeholder="e.g. Asha, Sherlock, Ben"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  disabled={formSubmitting}
                />
                <div className="form-hint">
                  Members are ordered by addition order for indivisible cent distribution.
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddMember(false)}
                  disabled={formSubmitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={formSubmitting}>
                  {formSubmitting ? 'Adding...' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Bill */}
      {showCreateBill && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-bill-title"
        >
          <div className="modal-content">
            <div className="modal-header">
              <h3 id="create-bill-title" className="modal-title">
                Split a New Bill
              </h3>
              <button type="button" className="close-btn" onClick={() => setShowCreateBill(false)}>
                ✕
              </button>
            </div>

            {modalError && (
              <div className="error-banner" style={{ marginBottom: '16px' }}>
                <span>⚠️ {modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateBill}>
              <div className="form-group">
                <label htmlFor={billTitleInputId} className="form-label">
                  Bill Title
                </label>
                <input
                  id={billTitleInputId}
                  type="text"
                  className="form-input"
                  placeholder="e.g. WiFi Bill, Groceries, Electricity"
                  value={newBillTitle}
                  onChange={(e) => setNewBillTitle(e.target.value)}
                  disabled={formSubmitting}
                />
              </div>

              <div className="form-group">
                <label htmlFor={billAmountInputId} className="form-label">
                  Total Amount ($)
                </label>
                <input
                  id={billAmountInputId}
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="form-input"
                  placeholder="e.g. 10.00 or 49.99"
                  value={newBillAmountDollars}
                  onChange={(e) => setNewBillAmountDollars(e.target.value)}
                  disabled={formSubmitting}
                />
                <div className="form-hint">
                  Split between all {members.length} members. Integers in cents (100¢ = $1.00).
                </div>
              </div>

              {/* Live Preview of Remainder Cent Allocation */}
              {calculatedSplit && (
                <div className="split-preview-box">
                  <div className="split-preview-title">Live Split Preview (in order added):</div>
                  <div className="split-preview-list">
                    {calculatedSplit.map((item, idx) => (
                      <div key={item.name} className="split-preview-item">
                        <span>
                          {idx + 1}. {item.name}
                        </span>
                        <span style={{ fontFamily: 'var(--font-family-mono)', fontWeight: 600 }}>
                          {formatCents(item.amountCents)} ({item.amountCents}¢)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateBill(false)}
                  disabled={formSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={formSubmitting || members.length === 0}
                >
                  {formSubmitting ? 'Creating & Splitting...' : 'Split Bill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {successToast && (
        <aside className="toast-container" aria-label="Notifications">
          <div className="toast toast-success" role="status">
            <span>✨</span>
            <span>{successToast}</span>
          </div>
        </aside>
      )}
    </div>
  )
}
