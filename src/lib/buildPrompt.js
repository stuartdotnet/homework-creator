const SUBJECT_CONFIGS = {
  maths: {
    label: 'Maths',
    minutes: 10,
    instructions: `
### Maths (~10 minutes)
Include TWO tasks:
1. **Main Problem** — a multi-step word problem or real-world application, slightly above grade level. Use an interesting context (sports stats, world records, space, money, the child's interests). 2–3 parts maximum.
2. **Puzzle or Pattern Challenge** — a short number puzzle, sequence, or logic problem. Should feel like a game, not a drill.`,
    answersNote: 'Show full worked solutions for each part. Flag if this is above grade level.',
  },
  english: {
    label: 'English',
    minutes: 7,
    instructions: `
### English (~7 minutes)
Choose ONE of:
- A short creative writing task (5–8 sentences) with a fun premise matching the child's interests — manga-style action, comedy, adventure, dark Roald Dahl humour, etc.
- A reading response — give a short interesting paragraph (include it), then ask 2 questions (inference, vocabulary, or opinion)
- A "rewrite this" challenge — provide a boring sentence and ask them to make it exciting

Avoid: grammar worksheets, spelling lists, dry comprehension. Keep it creative and slightly silly.`,
    answersNote: 'Provide marking notes: what to look for, example response, and what counts as a success at this age.',
  },
  stem: {
    label: 'STEM',
    minutes: 7,
    instructions: `
### STEM (~7 minutes)
Choose ONE of:
- A real-world data question (interpret statistics, make a prediction) — 2–3 questions max
- A short home experiment with household items — clear instructions, one interesting question to answer
- A "how does this work?" question — ask the child to explain in their own words or describe a diagram

Connect to cool science topics: space, animals, engineering, physics, technology, biology.`,
    answersNote: 'Give key facts and expected reasoning. Note any follow-up questions a curious child might ask.',
  },
  humanities: {
    label: 'Humanities',
    minutes: 6,
    instructions: `
### Humanities (~6 minutes)
Choose ONE of:
- A history mystery or surprising fact — ask the child to explain why something happened, or what they would have done
- A geography or current events question with a numbers/stats angle (populations, distances, records)
- A "what do you think?" dilemma about a real historical event — short response (2–4 sentences)

Hook: mysteries, records, counterintuitive facts, connections to modern life. Avoid date memorisation.`,
    answersNote: 'Give key facts, context, and what a good short response looks like. Frame the "right" answer as a thinking process, not a single fact.',
  },
}

export function buildPrompt({ name, grade, age, interests, subjects }) {
  const subjectList = subjects.map(s => SUBJECT_CONFIGS[s]).filter(Boolean)
  const totalMinutes = subjectList.reduce((sum, s) => sum + s.minutes, 0)

  const subjectInstructions = subjectList.map(s => s.instructions).join('\n')

  const prompt = `You are creating a fun, engaging homework set for a child. Here is the child's profile:

- **Name:** ${name}
- **Grade:** ${grade}${age ? ` (Age: ${age})` : ''}
- **Interests:** ${interests || 'not specified — use general fun topics like sports, animals, space, games'}

Your job is to create approximately ${totalMinutes} minutes of homework across ${subjectList.length} subject${subjectList.length > 1 ? 's' : ''}. The homework should feel like challenges and puzzles, not a worksheet. Use the child's interests as natural hooks wherever possible.

## Tone Rules
- Fun and energetic — write like a cool teacher, not a worksheet printer
- Use the child's interests as hooks: ${interests || 'sports, animals, science, games'}
- Avoid dry drills and rote exercises — every task should feel like a challenge or puzzle
- Encouraging language — frame difficulty as exciting, not intimidating
- Real data and big numbers are always a win

${subjectInstructions}

---

## Output Format

Produce TWO sections, clearly separated.

### SECTION 1: HOMEWORK (for the child)
Format it cleanly with markdown. Start with:
\`\`\`
# ${name}'s Homework

> ${totalMinutes} minutes. ${subjectList.length} subject${subjectList.length > 1 ? 's' : ''}. Let's go.
\`\`\`
Then each subject as a ## heading. No answers, no hints — just the tasks.

### SECTION 2: ANSWERS (for parents)
Start with:
\`\`\`
# Answers & Hints
### (For parents — don't show ${name} until they're done!)
\`\`\`
Then for each subject:
${subjectList.map(s => `- **${s.label}:** ${s.answersNote}`).join('\n')}

---

Produce both sections now. Use markdown throughout. Be fun and punchy.`

  return prompt
}

export function parseOutput(raw) {
  const section2Markers = [
    /#{1,3}\s*SECTION 2/i,
    /#{1,3}\s*ANSWERS/i,
    /^# Answers/im,
  ]

  for (const marker of section2Markers) {
    const match = raw.search(marker)
    if (match !== -1) {
      return {
        homework: raw.slice(0, match).trim(),
        answers: raw.slice(match).trim(),
      }
    }
  }

  // Fallback: return everything as homework
  return { homework: raw.trim(), answers: null }
}
