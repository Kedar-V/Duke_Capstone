import { test, expect } from '@playwright/test'

function pickRandom(items, count) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, Math.max(0, Math.min(count, copy.length)))
}

async function apiJson(request, method, url, token, body) {
  const response = await request.fetch(url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    ...(body !== undefined ? { data: body } : {}),
  })

  let json = null
  try {
    json = await response.json()
  } catch {
    json = null
  }

  return { response, json }
}

async function loginForToken(request, email, password) {
  const login = await apiJson(request, 'POST', '/api/auth/login', null, {
    email,
    password,
  })
  if (!login.response.ok()) return null
  return login.json?.access_token || null
}

test.describe('Randomized Student Workflow', () => {
  test('random project ranking + random partner preferences', async ({ request }) => {
    const email = process.env.E2E_STUDENT_EMAIL || 'dev@duke.edu'
    const password = process.env.E2E_STUDENT_PASSWORD || 'devpassword'
    const adminEmail = process.env.E2E_ADMIN_EMAIL || 'dev@duke.edu'
    const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'devpassword'

    const token = await loginForToken(request, email, password)
    expect(Boolean(token), 'login should return access token').toBeTruthy()

    const me = await apiJson(request, 'GET', '/api/auth/me', token)
    expect(me.response.ok(), 'student /me should succeed').toBeTruthy()
    const studentUserId = me.json?.id
    expect(Number.isFinite(studentUserId), 'student /me should include numeric id').toBeTruthy()

    const projectSearch = await apiJson(request, 'POST', '/api/search/projects', token, {
      limit: 30,
      offset: 0,
      match_mode: 'and',
      q: '',
      domains: [],
      skills: [],
      industries: [],
    })
    expect(projectSearch.response.ok(), 'project search must succeed').toBeTruthy()

    const projects = Array.isArray(projectSearch.json) ? projectSearch.json : []
    test.skip(projects.length < 3, `Need at least 3 visible projects, found ${projects.length}`)

    const chosenProjects = pickRandom(projects, Math.min(10, projects.length))

    for (const project of chosenProjects) {
      const ratingValue = Math.floor(Math.random() * 10) + 1
      const saveRating = await apiJson(request, 'POST', '/api/ratings', token, {
        project_id: project.id,
        rating: ratingValue,
      })
      expect(saveRating.response.ok(), `rating save should succeed for project ${project.id}`).toBeTruthy()

      const addCart = await apiJson(request, 'POST', '/api/cart/items', token, {
        project_id: project.id,
      })
      expect(addCart.response.ok(), `cart add should succeed for project ${project.id}`).toBeTruthy()
    }

    const rankingIds = chosenProjects.map((p) => p.id)
    const saveRankings = await apiJson(request, 'POST', '/api/rankings', token, {
      top_ten_ids: rankingIds,
    })

    let saveRankingsOk = saveRankings.response.ok()
    let saveRankingsDetail = String(saveRankings.json?.detail || '')

    if (!saveRankingsOk && saveRankingsDetail.includes('already submitted and locked')) {
      const adminToken = await loginForToken(request, adminEmail, adminPassword)
      if (adminToken) {
        const reopen = await apiJson(
          request,
          'POST',
          `/api/admin/rankings/${encodeURIComponent(studentUserId)}/reopen`,
          adminToken
        )

        if (reopen.response.ok()) {
          const retry = await apiJson(request, 'POST', '/api/rankings', token, {
            top_ten_ids: rankingIds,
          })
          saveRankingsOk = retry.response.ok()
          saveRankingsDetail = String(retry.json?.detail || '')
        }
      }
    }

    if (!saveRankingsOk) {
      const rankingLocked = saveRankingsDetail.includes('already submitted and locked')
      const deadlineClosed = saveRankingsDetail.includes('window is closed')
      test.skip(
        rankingLocked || deadlineClosed,
        `Randomized ranking mutation skipped due to environment constraint: ${saveRankingsDetail || 'unknown'}`
      )
      expect(saveRankingsOk, `rankings save failed unexpectedly: ${saveRankingsDetail}`).toBeTruthy()
    }

    const studentsResult = await apiJson(request, 'GET', '/api/students', token)
    expect(studentsResult.response.ok(), 'students list should succeed').toBeTruthy()

    const students = Array.isArray(studentsResult.json) ? studentsResult.json : []
    if (students.length > 0) {
      const want = pickRandom(students, Math.min(3, students.length))
      const remaining = students.filter((s) => !want.some((w) => w.id === s.id))
      const avoid = pickRandom(remaining, Math.min(2, remaining.length))

      const comments = {}
      const avoidReasons = {}
      for (const w of want) comments[w.id] = 'Randomized E2E want'
      for (const a of avoid) {
        comments[a.id] = 'Randomized E2E avoid'
        avoidReasons[a.id] = 'Randomized E2E avoid'
      }

      const savePrefs = await apiJson(request, 'POST', '/api/teammate-choices', token, {
        want_ids: want.map((x) => x.id),
        avoid_ids: avoid.map((x) => x.id),
        comments,
        avoid_reasons: avoidReasons,
      })
      expect(savePrefs.response.ok(), 'saving teammate preferences should succeed').toBeTruthy()

      const readPrefs = await apiJson(request, 'GET', '/api/teammate-choices', token)
      expect(readPrefs.response.ok(), 'reading teammate preferences should succeed').toBeTruthy()

      const wantOut = readPrefs.json?.want_ids || []
      const avoidOut = readPrefs.json?.avoid_ids || []
      expect(wantOut.length).toBe(want.length)
      expect(avoidOut.length).toBe(avoid.length)
    }

    if (rankingIds.length === 10) {
      const submit = await apiJson(request, 'POST', '/api/rankings/submit', token)
      const submitted = submit.response.ok()
      const submitDetail = String(submit.json?.detail || '')
      const deadlineClosed = submit.response.status() === 400 && submitDetail.includes('closed')
      const rankCountConstraint = submit.response.status() === 400 && submitDetail.includes('rank exactly 10 projects')
      const ratingConstraint = submit.response.status() === 400 && submitDetail.includes('must be rated')

      expect(
        submitted || deadlineClosed || rankCountConstraint || ratingConstraint,
        `submit returned unexpected response: ${submit.response.status()} ${submitDetail}`
      ).toBeTruthy()
    }
  })
})
