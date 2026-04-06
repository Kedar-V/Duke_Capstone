import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCart } from '../api'
import { subscribe } from '../events'
import { getUser } from '../auth'

export default function CartNavIcon() {
  const navigate = useNavigate()
  const [cartCount, setCartCount] = useState(0)



  useEffect(() => {
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
  }, [])

  return (
    <button
      type="button"
      aria-label="View selected projects menu"
      className="relative text-slate-500 hover:text-duke-900 transition-colors p-2 rounded-full hover:bg-slate-100 mr-1"
      onClick={() => {
        import('../events').then((m) => m.emit('toggle_cart_drawer'))
      }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
        <line x1="3" y1="6" x2="21" y2="6"/>
        <path d="M16 10a4 4 0 0 1-8 0"/>
      </svg>
      
      {/* Badge */}
      {cartCount > 0 ? (
        <span className="absolute top-1 right-0 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-pink-600 text-white text-[10px] font-bold shadow-sm border border-white">
          {cartCount}
        </span>
      ) : null}
    </button>
  )
}
