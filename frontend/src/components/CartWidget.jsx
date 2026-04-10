import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { getCart } from '../api'
import { subscribe } from '../events'
import { getToken } from '../auth'

export default function CartWidget() {
  const location = useLocation()
  const [cartCount, setCartCount] = useState(0)
  const isVisible = Boolean(getToken()) && location.pathname !== '/login'

  useEffect(() => {
    if (!isVisible) {
      setCartCount(0)
      return undefined
    }

    let cancelled = false

    async function load() {
      try {
        const cart = await getCart()
        if (!cancelled) setCartCount(cart?.selected || 0)
      } catch (err) {
        // ignore errors if not authed
      }
    }

    load()

    const unsubscribe = subscribe('cart_updated', (cartObj) => {
      if (cartObj && typeof cartObj.selected === 'number') {
        setCartCount(cartObj.selected)
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [isVisible])

  // Mobile-only floating cart; hide for logged-out users and on login.
  if (!isVisible) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 md:hidden">
      <button
        type="button"
        aria-label="Open selected projects drawer"
        className="group relative flex h-10 w-10 items-center justify-center rounded-full bg-duke-900 text-white shadow-md ring-1 ring-white/80 transition-all duration-200 hover:scale-[1.03] hover:bg-duke-800"
        onClick={() => {
          import('../events').then((m) => m.emit('toggle_cart_drawer'))
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
          <line x1="3" y1="6" x2="21" y2="6"/>
          <path d="M16 10a4 4 0 0 1-8 0"/>
        </svg>
        
        {/* Badge */}
        {cartCount > 0 ? (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-pink-600 px-1 text-[9px] font-semibold text-white shadow-sm ring-1 ring-white transition-transform group-hover:scale-105">
            {cartCount}
          </span>
        ) : null}
      </button>
    </div>
  )
}
