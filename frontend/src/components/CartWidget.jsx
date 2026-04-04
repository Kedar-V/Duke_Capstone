import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getCart } from '../api'
import { subscribe } from '../events'
import { getToken, getUser } from '../auth'

export default function CartWidget() {
  const navigate = useNavigate()
  const location = useLocation()
  const [cartCount, setCartCount] = useState(0)

  // Don't show the widget on the login page or the rankings page itself (since you're already there)
  if (!getToken() || location.pathname === '/login' || location.pathname === '/rankings') {
    return null
  }

  // Only show to students
  const user = getUser()
  if (user && user.role !== 'student') {
    return null
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const cart = await getCart()
        if (!cancelled) setCartCount(cart.selected || 0)
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
  }, [])

  if (cartCount === 0) return null

  return (
    <div className="fixed bottom-6 right-6 z-40">
      <button
        type="button"
        aria-label="View selected projects menu"
        className="group flex items-center justify-center relative w-16 h-16 rounded-full bg-duke-900 border-2 border-white text-white shadow-xl hover:scale-105 hover:shadow-2xl hover:bg-duke-800 transition-all duration-300"
        onClick={() => navigate('/rankings')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18"/>
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
        </svg>
        
        {/* Badge */}
        <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-pink-600 text-white text-xs font-bold shadow ring-2 ring-white transform group-hover:scale-110 transition-transform">
          {cartCount}
        </span>
      </button>
    </div>
  )
}
