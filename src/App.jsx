import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { buildPrompt, parseOutput } from './lib/buildPrompt'
import { generateHomework, isConfigured } from './lib/foundry'
import { mountTurnstile } from './lib/turnstile'
import { buildShareLink, readSharedHomework, LONG_LINK_THRESHOLD } from './lib/shareLink'
import { validateForm, LIMITS } from './lib/validateForm'

const SUBJECTS = [
  { id: 'maths',      label: 'Maths',       icon: '🔢' },
  { id: 'english',    label: 'English',     icon: '📖' },
  { id: 'stem',       label: 'STEM',        icon: '🔬' },
  { id: 'humanities', label: 'Humanities',  icon: '🌍' },
]

const DEFAULT_SUBJECTS = SUBJECTS.map(s => s.id)

async function hashPassword(password) {
  const data = new TextEncoder().encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function App() {
  const [form, setForm] = useState({
    name: '',
    grade: '',
    age: '',
    interests: '',
  })
  const [selectedSubjects, setSelectedSubjects] = useState(new Set(DEFAULT_SUBJECTS))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [showAnswers, setShowAnswers] = useState(false)

  // Turnstile renders a visible badge here and solves on load, so a token is
  // normally ready before the user presses Generate.
  const turnstileRef = useRef(null)
  useEffect(() => {
    mountTurnstile(turnstileRef.current)
  }, [])

  // Parent lock state — kept in memory only so it clears on every page refresh
  const [lockHash, setLockHash] = useState(null)
  const parentLock = !!lockHash
  const [showLockSetup, setShowLockSetup] = useState(false)
  const [lockInput, setLockInput] = useState({ password: '', confirm: '' })
  const [lockError, setLockError] = useState(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [promptInput, setPromptInput] = useState('')
  const [promptError, setPromptError] = useState(null)

  const [sharedView, setSharedView] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [shareUrl, setShareUrl] = useState(null)
  const [shareError, setShareError] = useState(null)

  // Errors appear only after the first submit attempt, then update live so
  // they clear as the user fixes each field.
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitAttempted, setSubmitAttempted] = useState(false)

  // A shared link only ever carries homework text (never answers) — see
  // src/lib/shareLink.js. Load it once on mount if the URL has one.
  useEffect(() => {
    readSharedHomework()
      .then(homework => {
        if (homework) {
          setResult({ homework, answers: null })
          setSharedView(true)
        }
      })
      .catch(() => {}) // malformed/foreign hash — ignore, show the normal form
  }, [])

  useEffect(() => {
    if (submitAttempted) setFieldErrors(validateForm(form))
  }, [form, submitAttempted])

  // Build the share link as soon as homework exists, not when Share is
  // clicked. Firefox drops the user-activation that authorises a clipboard
  // write if you await anything first, so the click handler must be able to
  // copy synchronously.
  useEffect(() => {
    if (!result?.homework) {
      setShareUrl(null)
      return
    }
    let stale = false
    buildShareLink(result.homework)
      .then(url => { if (!stale) { setShareUrl(url); setShareError(null) } })
      .catch(() => { if (!stale) setShareError('This browser cannot create share links.') })
    return () => { stale = true }
  }, [result])

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  function toggleSubject(id) {
    setSelectedSubjects(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size === 1) return prev
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const [answersUnlocked, setAnswersUnlocked] = useState(false)

  async function doGenerate() {
    setLoading(true)
    setError(null)

    try {
      const prompt = buildPrompt({
        name: form.name,
        grade: form.grade,
        age: form.age,
        interests: form.interests,
        subjects: SUBJECTS.filter(s => selectedSubjects.has(s.id)).map(s => s.id),
      })
      const raw = await generateHomework(prompt)
      setResult(parseOutput(raw))
      setShowAnswers(false)
      setAnswersUnlocked(false)
      setSharedView(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerate(e) {
    e.preventDefault()
    setSubmitAttempted(true)
    const errors = validateForm(form)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    await doGenerate()
  }

  function handleShowAnswers() {
    if (parentLock && !answersUnlocked) {
      setShowPrompt(true)
      return
    }
    setShowAnswers(a => !a)
  }

  async function handlePromptConfirm() {
    const hash = await hashPassword(promptInput)
    if (hash !== lockHash) {
      setPromptError('Incorrect password')
      return
    }
    setShowPrompt(false)
    setPromptInput('')
    setPromptError(null)
    setAnswersUnlocked(true)
    setShowAnswers(true)
  }

  function handlePromptCancel() {
    setShowPrompt(false)
    setPromptInput('')
    setPromptError(null)
  }

  async function handleSetLock() {
    if (!lockInput.password) { setLockError('Please enter a password'); return }
    if (lockInput.password !== lockInput.confirm) { setLockError('Passwords do not match'); return }
    const hash = await hashPassword(lockInput.password)
    setLockHash(hash)
    setShowLockSetup(false)
    setLockInput({ password: '', confirm: '' })
    setLockError(null)
    setAnswersUnlocked(false)
    setShowAnswers(false)
  }

  async function handleRemoveLock() {
    if (!lockInput.password) { setLockError('Please enter the current password'); return }
    const hash = await hashPassword(lockInput.password)
    if (hash !== lockHash) { setLockError('Incorrect password'); return }
    setLockHash(null)
    setLockInput({ password: '', confirm: '' })
    setLockError(null)
  }

  const [copied, setCopied] = useState(false)

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleShare() {
    setLinkCopied(false)
    setShowShare(true)
  }

  // Called straight from the button's click handler with no await in front of
  // it, so the browser still sees an active user gesture (see the effect that
  // precomputes shareUrl). The link stays on screen either way, so a blocked
  // clipboard just means the user selects and copies it by hand.
  function handleCopyShareLink() {
    if (!shareUrl) return
    // navigator.clipboard is undefined outside secure contexts, which would
    // throw here rather than reject below.
    if (!navigator.clipboard) {
      setShareError('Copying is unavailable here. Select the link above and copy it manually.')
      return
    }
    navigator.clipboard.writeText(shareUrl).then(
      () => {
        setLinkCopied(true)
        setTimeout(() => setLinkCopied(false), 2000)
      },
      () => setShareError('Your browser blocked the copy. Select the link above and copy it manually.')
    )
  }

  function saveToFile(text, filename) {
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const canGenerate = form.name && form.grade && selectedSubjects.size > 0

  return (
    <div className="app">
      <div className="header">
        <h1>Homework Creator</h1>
        <p>Generate fun, personalised homework in seconds.</p>
      </div>

      {!isConfigured() && (
        <div className="config-note">
          <strong>Setup required</strong>
          Human verification isn't configured yet. Set <code>VITE_TURNSTILE_SITEKEY</code> (and deploy the <code>/api/generate</code> function with your Azure secrets). See the README's <em>Deploying</em> section for step-by-step instructions.
        </div>
      )}

      {/* noValidate: this form uses its own styled validation (validateForm)
          so browsers don't also pop their own inconsistent tooltips. */}
      <form onSubmit={handleGenerate} noValidate>
        <div className="card">
          <h2>Child's profile</h2>

          <div className="field-row">
            <div className="field">
              <label>Name *</label>
              <input
                value={form.name}
                onChange={set('name')}
                placeholder="e.g. Charlie"
                maxLength={LIMITS.nameMax}
                required
              />
              {fieldErrors.name && <div className="field-error">{fieldErrors.name}</div>}
            </div>
            <div className="field">
              <label>Grade / Year *</label>
              <input
                value={form.grade}
                onChange={set('grade')}
                placeholder="e.g. 6"
                type="number"
                min={LIMITS.gradeMin}
                max={LIMITS.gradeMax}
                required
              />
              {fieldErrors.grade && <div className="field-error">{fieldErrors.grade}</div>}
            </div>
          </div>

          <div className="field">
            <label>Age (optional)</label>
            <input
              value={form.age}
              onChange={set('age')}
              placeholder="e.g. 11"
              type="number"
              min={LIMITS.ageMin}
              max={LIMITS.ageMax}
            />
            {fieldErrors.age && <div className="field-error">{fieldErrors.age}</div>}
          </div>

          <div className="field">
            <label>Interests</label>
            <textarea
              value={form.interests}
              onChange={set('interests')}
              maxLength={LIMITS.interestsMax}
              placeholder="e.g. One Piece manga, football stats, space, Roald Dahl, Minecraft..."
            />
            {fieldErrors.interests && <div className="field-error">{fieldErrors.interests}</div>}
            <div className="hint">
              The more specific, the more engaging the homework. Separate with commas.
              {' '}({form.interests.length}/{LIMITS.interestsMax})
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Subjects</h2>
          <div className="subjects">
            {SUBJECTS.map(subject => (
              <label
                key={subject.id}
                className={`subject-toggle ${selectedSubjects.has(subject.id) ? 'active' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selectedSubjects.has(subject.id)}
                  onChange={() => toggleSubject(subject.id)}
                />
                <span className="icon">{subject.icon}</span>
                {subject.label}
              </label>
            ))}
          </div>
        </div>

        <div className="turnstile-box" ref={turnstileRef} />

        <button className="btn" type="submit" disabled={!canGenerate || loading || !isConfigured()}>
          {loading ? 'Generating…' : 'Generate Homework'}
        </button>
      </form>

      {showPrompt && (
        <div className="modal-overlay">
          <div className="modal">
            <h3 className="modal-title">Parent lock</h3>
            <p className="modal-desc">Enter the parent password to reveal the answers.</p>
            <div className="field">
              <input
                type="password"
                value={promptInput}
                onChange={e => setPromptInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handlePromptConfirm()}
                placeholder="Password"
                autoFocus
              />
            </div>
            {promptError && <div className="lock-error">{promptError}</div>}
            <div className="lock-actions">
              <button className="btn lock-btn" type="button" onClick={handlePromptConfirm}>Confirm</button>
              <button className="btn secondary lock-btn" type="button" onClick={handlePromptCancel}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showShare && (
        <div className="modal-overlay">
          <div className="modal">
            <h3 className="modal-title">Share this homework</h3>
            <p className="modal-desc">
              {result?.answers
                ? 'The link carries the homework only, not the answers. The answers exist only in this browser, so copy or save them first if you want to keep them.'
                : 'Anyone with this link can read the homework. Nothing is stored on a server.'}
            </p>
            <div className="field">
              <input
                type="text"
                readOnly
                value={shareUrl || 'Building link…'}
                onFocus={e => e.target.select()}
                autoFocus
              />
            </div>
            {shareUrl && shareUrl.length > LONG_LINK_THRESHOLD && (
              <div className="share-warning">
                This is a long link ({shareUrl.length.toLocaleString()} characters). Messaging
                apps handle it fine, but some email programs break long links across lines.
                For email, close this and use <strong>Save</strong> to send the file instead.
              </div>
            )}
            {shareError && <div className="lock-error">{shareError}</div>}
            <div className="lock-actions">
              <button
                className="btn lock-btn"
                type="button"
                onClick={handleCopyShareLink}
                disabled={!shareUrl}
              >
                {linkCopied ? 'Copied!' : 'Copy link'}
              </button>
              <button
                className="btn secondary lock-btn"
                type="button"
                onClick={() => { setShowShare(false); setShareError(null) }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="loading">
            <div className="spinner" />
            <span>Building today's homework…</span>
          </div>
        </div>
      )}

      {error && (
        <div className="error-box" style={{ marginTop: 20 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="output-header">
            <h2>{showAnswers ? 'Answers & Hints' : "Homework"}</h2>
            <span className="badge">{sharedView ? 'Shared' : 'Ready'}</span>
          </div>

          <div className="homework-content">
            <ReactMarkdown>
              {showAnswers ? result.answers : result.homework}
            </ReactMarkdown>
          </div>

          <div className="output-actions">
            <button
              className="btn secondary"
              onClick={() => copyToClipboard(showAnswers ? result.answers : result.homework)}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              className="btn secondary"
              onClick={() => saveToFile(
                showAnswers ? result.answers : result.homework,
                `${form.name || 'homework'}-${showAnswers ? 'answers' : 'homework'}.txt`
              )}
            >
              Save
            </button>
            {!showAnswers && (
              <button className="btn secondary" onClick={handleShare}>
                Share
              </button>
            )}
            {result.answers && (
              <button
                className="btn secondary"
                onClick={showAnswers ? () => setShowAnswers(false) : handleShowAnswers}
              >
                {showAnswers ? 'Show Homework' : parentLock && !answersUnlocked ? '🔒 Show Answers' : 'Show Answers'}
              </button>
            )}
          </div>
        </div>
      )}

      {result && result.answers && (
        <div className="card" style={{ marginTop: 20 }}>
          <h2>
            <span className="lock-icon">{parentLock && !answersUnlocked ? '🔒' : '🔓'}</span>
            {' '}Parent lock
          </h2>
          {parentLock ? (
            answersUnlocked ? (
              <>
                <div className="lock-status">
                  <span className="lock-icon">🔓</span>
                  <span>Answers are visible — set a new code to re-lock</span>
                </div>
                {showLockSetup ? (
                  <>
                    <div className="field" style={{ marginTop: 12 }}>
                      <label>New password</label>
                      <input
                        type="password"
                        value={lockInput.password}
                        onChange={e => setLockInput(p => ({ ...p, password: e.target.value }))}
                        placeholder="Choose a new password"
                      />
                    </div>
                    <div className="field">
                      <label>Confirm password</label>
                      <input
                        type="password"
                        value={lockInput.confirm}
                        onChange={e => setLockInput(p => ({ ...p, confirm: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && handleSetLock()}
                        placeholder="Repeat password"
                      />
                    </div>
                    {lockError && <div className="lock-error">{lockError}</div>}
                    <div className="lock-actions">
                      <button className="btn lock-btn" type="button" onClick={handleSetLock}>Lock answers</button>
                      <button className="btn secondary lock-btn" type="button" onClick={() => { setShowLockSetup(false); setLockInput({ password: '', confirm: '' }); setLockError(null) }}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <button className="btn secondary lock-btn" type="button" onClick={() => setShowLockSetup(true)} style={{ marginTop: 12 }}>
                    Lock again with new code
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="lock-status">
                  <span className="lock-icon">🔒</span>
                  <span>Answers are locked — enter password to remove</span>
                </div>
                <div className="field" style={{ marginTop: 12 }}>
                  <label>Current password</label>
                  <input
                    type="password"
                    value={lockInput.password}
                    onChange={e => setLockInput(p => ({ ...p, password: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleRemoveLock()}
                    placeholder="Enter password to remove lock"
                  />
                </div>
                {lockError && <div className="lock-error">{lockError}</div>}
                <button className="btn secondary lock-btn" type="button" onClick={handleRemoveLock}>
                  Remove lock
                </button>
              </>
            )
          ) : showLockSetup ? (
            <>
              <div className="field">
                <label>Password</label>
                <input
                  type="password"
                  value={lockInput.password}
                  onChange={e => setLockInput(p => ({ ...p, password: e.target.value }))}
                  placeholder="Choose a password"
                />
              </div>
              <div className="field">
                <label>Confirm password</label>
                <input
                  type="password"
                  value={lockInput.confirm}
                  onChange={e => setLockInput(p => ({ ...p, confirm: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleSetLock()}
                  placeholder="Repeat password"
                />
              </div>
              {lockError && <div className="lock-error">{lockError}</div>}
              <div className="lock-actions">
                <button className="btn lock-btn" type="button" onClick={handleSetLock}>Enable lock</button>
                <button className="btn secondary lock-btn" type="button" onClick={() => { setShowLockSetup(false); setLockInput({ password: '', confirm: '' }); setLockError(null) }}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <p className="lock-hint">Set a password so only you can reveal the answers.</p>
              <button className="btn secondary lock-btn" type="button" onClick={() => setShowLockSetup(true)}>
                Set parent lock
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
