export const CmuxNotifyPlugin = async ({ $, client }) => {
  let lastKey = ""
  let notificationsClearedForActivity = false
  const rootSessions = new Set()
  const childToRoot = new Map()
  const childAgentBySession = new Map()
  const rootChildren = new Map()
  const questionByRoot = new Map()
  const busyByRoot = new Map()
  const touchedAtByRoot = new Map()
  let renderedStatus = ""

  const notify = async (title, body) => {
    const key = `${title}::${body}`
    if (key === lastKey) return
    lastKey = key

    try {
      await $`cmux notify --title ${title} --body ${body}`
    } catch (error) {
      await client.app.log({
        body: {
          service: "cmux-notify-plugin",
          level: "warn",
          message: "cmux notify failed",
          extra: {
            title,
            body,
            error: error instanceof Error ? error.message : String(error),
          },
        },
      })
    }
  }

  const formatPatterns = (patterns) => {
    if (!Array.isArray(patterns) || patterns.length === 0) return ""
    return patterns.slice(0, 2).join(", ")
  }

  const formatError = (error) => {
    if (!error || typeof error !== "object") return "Unknown error"
    if (typeof error.message === "string" && error.message.trim()) return error.message.trim()
    if (typeof error.name === "string" && error.name.trim()) return error.name.trim()
    return "Unknown error"
  }

  const parseAgentFromTitle = (title) => {
    if (typeof title !== "string") return undefined
    const match = title.match(/\(@([^\)]+) subagent\)/)
    return match?.[1]
  }

  const setChildAgent = (sessionID, rootID, agent) => {
    if (!sessionID || !rootID || !agent) return
    childToRoot.set(sessionID, rootID)
    childAgentBySession.set(sessionID, agent)
    const children = rootChildren.get(rootID) ?? new Set()
    children.add(sessionID)
    rootChildren.set(rootID, children)
    touchedAtByRoot.set(rootID, Date.now())
  }

  const forgetChild = (sessionID) => {
    if (!sessionID) return
    const rootID = childToRoot.get(sessionID)
    childAgentBySession.delete(sessionID)
    if (rootID) {
      const children = rootChildren.get(rootID)
      if (children) {
        children.delete(sessionID)
        if (children.size === 0) rootChildren.delete(rootID)
      }
    }
    childToRoot.delete(sessionID)
  }

  const rememberSession = (info) => {
    if (!info?.id) return
    if (info.parentID) {
      const rootID = rootSessionID(info.parentID, false)
      if (!rootID) return
      childToRoot.set(info.id, rootID)
      const agent = parseAgentFromTitle(info.title)
      if (agent) setChildAgent(info.id, rootID, agent)
      return
    }
    rootSessions.add(info.id)
    childToRoot.set(info.id, info.id)
  }

  const rootSessionID = (sessionID, allowUnknownRoot = true) => {
    if (!sessionID) return undefined
    let current = sessionID
    const seen = new Set()
    while (current && !seen.has(current)) {
      seen.add(current)
      if (rootSessions.has(current)) return current
      const next = childToRoot.get(current)
      if (!next) return allowUnknownRoot ? sessionID : undefined
      if (next === current) return current
      current = next
    }
    return allowUnknownRoot ? sessionID : undefined
  }

  const isRootSession = (sessionID) => rootSessionID(sessionID) === sessionID

  const rootIsActive = (sessionID) => {
    if (!sessionID) return false
    return Boolean(questionByRoot.get(sessionID) || busyByRoot.get(sessionID))
  }

  const rootStatusText = (sessionID) => {
    if (!sessionID) return
    const question = questionByRoot.get(sessionID)
    if (question) return question
    const agents = [...(rootChildren.get(sessionID) ?? new Set())]
      .map((childID) => childAgentBySession.get(childID))
      .filter(Boolean)
    if (agents.length > 0) return agents.map((agent) => `⏳ ${agent}`).join(", ")
    if (busyByRoot.get(sessionID)) return "Thinking"
    return ""
  }

  const clearNotificationsCommand = async () => {
    try {
      await $`cmux clear-notifications`
    } catch (error) {
      await client.app.log({
        body: {
          service: "cmux-notify-plugin",
          level: "warn",
          message: "cmux clear-notifications failed",
          extra: {
            error: error instanceof Error ? error.message : String(error),
          },
        },
      })
    }
  }

  const selectDisplayedRoot = () => {
    const activeRoots = [...rootSessions].filter(rootIsActive)
    if (activeRoots.length === 0) return undefined
    const questionRoots = activeRoots.filter((rootID) => Boolean(questionByRoot.get(rootID)))
    if (questionRoots.length > 0) {
      questionRoots.sort((a, b) => (touchedAtByRoot.get(b) ?? 0) - (touchedAtByRoot.get(a) ?? 0))
      return questionRoots[0]
    }
    activeRoots.sort((a, b) => (touchedAtByRoot.get(b) ?? 0) - (touchedAtByRoot.get(a) ?? 0))
    return activeRoots[0]
  }

  const setStatusCommand = async (value, icon, color) => {
    try {
      await $`cmux set-status opencode ${value} --icon ${icon} --color ${color}`
    } catch (error) {
      await client.app.log({
        body: {
          service: "cmux-notify-plugin",
          level: "warn",
          message: "cmux set-status failed",
          extra: {
            value,
            icon,
            color,
            error: error instanceof Error ? error.message : String(error),
          },
        },
      })
    }
  }

  const clearStatusCommand = async () => {
    try {
      await $`cmux clear-status opencode`
    } catch (error) {
      await client.app.log({
        body: {
          service: "cmux-notify-plugin",
          level: "warn",
          message: "cmux clear-status failed",
          extra: {
            error: error instanceof Error ? error.message : String(error),
          },
        },
      })
    }
  }

  const syncStatus = async () => {
    const displayedRoot = selectDisplayedRoot()
    if (!displayedRoot) {
      renderedStatus = ""
      notificationsClearedForActivity = false
      await clearStatusCommand()
      return
    }

    const value = rootStatusText(displayedRoot)
    if (!value) {
      renderedStatus = ""
      await clearStatusCommand()
      return
    }

    if (renderedStatus === value) return
    if (!notificationsClearedForActivity) {
      notificationsClearedForActivity = true
      await clearNotificationsCommand()
    }
    renderedStatus = value
    const isQuestion = Boolean(questionByRoot.get(displayedRoot))
    await setStatusCommand(
      value,
      isQuestion ? "message-circle-question" : "loader",
      isQuestion ? "#f59e0b" : "#60a5fa",
    )
  }

  const clearRootState = (sessionID) => {
    if (!sessionID) return
    questionByRoot.delete(sessionID)
    busyByRoot.delete(sessionID)
    touchedAtByRoot.delete(sessionID)
    const children = rootChildren.get(sessionID) ?? new Set()
    for (const childID of children) forgetChild(childID)
    rootChildren.delete(sessionID)
    childToRoot.delete(sessionID)
    rootSessions.delete(sessionID)
  }

  const removeChildAgent = (sessionID) => {
    const rootID = rootSessionID(sessionID, false)
    forgetChild(sessionID)
    if (!rootID) return
    touchedAtByRoot.set(rootID, Date.now())
  }

  await clearStatusCommand()

  return {
    event: async ({ event }) => {
      if (event.type === "session.created" || event.type === "session.updated") {
        rememberSession(event.properties?.info)
        await syncStatus()
        return
      }

      if (event.type === "message.part.updated") {
        const part = event.properties?.part
        if (part?.type !== "subtask") return
        const rootID = rootSessionID(part.sessionID, false)
        if (!rootID) return
        const agent = part.agent ?? part.description ?? "subagent"
        const childSessionID = [...(rootChildren.get(rootID) ?? new Set())].find(
          (childID) => childAgentBySession.get(childID) === agent,
        )
        if (childSessionID) setChildAgent(childSessionID, rootID, agent)
        await syncStatus()
        return
      }

      if (event.type === "question.asked") {
        const rootID = rootSessionID(event.properties?.sessionID, false)
        if (!rootID) return
        const question = event.properties?.questions?.[0]?.header || "Question"
        questionByRoot.set(rootID, `Needs answer: ${question}`)
        touchedAtByRoot.set(rootID, Date.now())
        await syncStatus()
        await notify("OpenCode needs answer", question)
        return
      }

      if (event.type === "question.replied" || event.type === "question.rejected") {
        const rootID = rootSessionID(event.properties?.sessionID, false)
        if (!rootID) return
        questionByRoot.delete(rootID)
        touchedAtByRoot.set(rootID, Date.now())
        await syncStatus()
        return
      }

      if (event.type === "permission.asked") {
        const permission = event.properties?.permission ?? "permission"
        const patterns = formatPatterns(event.properties?.patterns)
        const body = patterns ? `${permission}: ${patterns}` : permission
        await notify("OpenCode needs permission", body)
        return
      }

      if (event.type === "session.error") {
        await notify("OpenCode session error", formatError(event.properties?.error))
        return
      }

      if (event.type === "session.status") {
        const sessionID = event.properties?.sessionID
        const wasRootSession = isRootSession(sessionID)
        const rootID = rootSessionID(sessionID, false)
        const status = event.properties?.status
        if (!rootID) return
        if (status?.type === "busy") {
          busyByRoot.set(rootID, true)
          touchedAtByRoot.set(rootID, Date.now())
          await syncStatus()
        }
        if (status?.type === "retry") {
          busyByRoot.set(rootID, true)
          touchedAtByRoot.set(rootID, Date.now())
          const body = `Attempt ${status.attempt}: ${status.message}`
          await notify("OpenCode retrying", body)
          await syncStatus()
        }
        if (status?.type === "idle") {
          if (wasRootSession) {
            clearRootState(rootID)
          } else {
            removeChildAgent(sessionID)
            touchedAtByRoot.set(rootID, Date.now())
          }
          await syncStatus()
        }
        return
      }

      if (event.type === "session.idle") {
        const sessionID = event.properties?.sessionID
        const wasRootSession = isRootSession(sessionID)
        const rootID = rootSessionID(sessionID, false)
        if (!rootID) return
        if (wasRootSession) {
          lastKey = ""
          clearRootState(rootID)
        } else {
          removeChildAgent(sessionID)
          touchedAtByRoot.set(rootID, Date.now())
        }
        await syncStatus()
        if (!wasRootSession) return
        await notify("OpenCode finished", "Session is idle")
      }
    },
  }
}
