import { useEffect, useState } from 'react'
import { getRankings, removeCartItem, saveRankings } from '../api'

export default function RankingsPage() {
  const [additionalSelections, setAdditionalSelections] = useState([])
  const [topTen, setTopTen] = useState([])
  const [dragItem, setDragItem] = useState(null)

  useEffect(() => {
    refreshRankings()
  }, [])

  function refreshRankings() {
    return getRankings()
      .then((data) => {
        const additional = data.additional ?? []
        const ranked = data.top_ten ?? []
        if (ranked.length === 0 && additional.length > 0) {
          setTopTen(additional.slice(0, 10))
          setAdditionalSelections(additional.slice(10))
        } else {
          setAdditionalSelections(additional)
          setTopTen(ranked)
        }
      })
      .catch(() => {
        setAdditionalSelections([])
        setTopTen([])
      })
  }

  async function persistTopTen(list) {
    await saveRankings({ topTenIds: list.map((item) => item.id) })
  }

  function onDragStart(listName, index) {
    setDragItem({ listName, index })
  }

  function onDrop(listName, index) {
    if (!dragItem) return

    if (dragItem.listName === listName) {
      const list = listName === 'top' ? [...topTen] : [...additionalSelections]
      const [moved] = list.splice(dragItem.index, 1)
      const insertIndex = index ?? list.length
      list.splice(insertIndex, 0, moved)
      if (listName === 'top') {
        setTopTen(list)
        persistTopTen(list)
      } else {
        setAdditionalSelections(list)
      }
      setDragItem(null)
      return
    }

    const fromList = dragItem.listName === 'top' ? [...topTen] : [...additionalSelections]
    const [moved] = fromList.splice(dragItem.index, 1)
    const toList = listName === 'top' ? [...topTen] : [...additionalSelections]
    const insertIndex = index ?? toList.length
    toList.splice(insertIndex, 0, moved)

    if (dragItem.listName === 'top') {
      setTopTen(fromList)
      persistTopTen(fromList)
    } else {
      setAdditionalSelections(fromList)
    }

    if (listName === 'top') {
      setTopTen(toList)
      persistTopTen(toList)
    } else {
      setAdditionalSelections(toList)
    }

    setDragItem(null)
  }

  async function removeFromAdditional(index) {
    const item = additionalSelections[index]
    if (!item) return
    await removeCartItem(item.id)
    await refreshRankings()
  }

  async function removeFromTop(index) {
    const item = topTen[index]
    if (!item) return
    await removeCartItem(item.id)
    await refreshRankings()
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-48">
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-6">
        <div>
          <h1 className="text-3xl font-heading text-duke-900">Capstone Project Ranking</h1>
          <p className="muted mt-2">Reorder your selected projects to finalize your ranking.</p>
        </div>

        <div className="card p-6 ">
          <div className="text-duke-900 font-semibold">Additional selections (not ranked yet)</div>
          <div className="muted mt-1">Drag into the top bar to include in your top 10.</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {additionalSelections.map((item, index) => (
              <div
                key={item.id}
                className="card p-4 transition-transform duration-150 hover:-translate-y-0.5"
                role="button"
                tabIndex={0}
                aria-disabled="false"
                draggable
                onDragStart={() => onDragStart('additional', index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => onDrop('additional', index)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-duke-900">{item.title}</div>
                    <div className="text-xs text-slate-500">{item.organization}</div>
                  </div>
                  <button
                    type="button"
                    className="text-sm text-red-600 hover:text-red-700"
                    onClick={() => removeFromAdditional(index)}
                  >
                    Remove
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {(item.tags ?? []).map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="fixed bottom-0 left-0 right-0 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.08)] border-t border-slate-200 ">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-heading text-duke-900">Your Top 10 Choices (Ranked)</h3>
            <div className="text-sm text-slate-500">{topTen.length}/10 ranked</div>
          </div>
          <div
            className="mt-3 flex items-center gap-3 overflow-x-auto pb-2"
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => onDrop('top', undefined)}
          >
            {topTen.map((item, index) => (
              <div
                key={item.id}
                className="w-[220px] shrink-0 rounded-xl bg-white border border-slate-200 p-3 transition-transform duration-150 hover:-translate-y-0.5"
                role="button"
                tabIndex={0}
                aria-disabled="false"
                draggable
                onDragStart={() => onDragStart('top', index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => onDrop('top', index)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-semibold text-duke-700">#{index + 1}</div>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-red-500"
                    aria-label="Remove from top ten"
                    onClick={() => removeFromTop(index)}
                  >
                    ✕
                  </button>
                </div>
                <div className="text-sm font-semibold text-duke-900 mt-2">{item.title}</div>
                <div className="text-xs text-slate-500 mt-1">{item.organization}</div>
                <div className="flex flex-wrap gap-1 mt-3">
                  {(item.tags ?? []).map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
