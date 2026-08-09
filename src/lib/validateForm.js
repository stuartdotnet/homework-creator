// Client-side form validation. Pure — no React, no DOM — so it can be
// tested directly and reused anywhere.
//
// Interests is interpolated into the prompt twice and the server rejects
// anything over 8000 chars (MAX_PROMPT_CHARS in functions/api/generate.js).
// The base prompt is ~3600 chars, so 500 here leaves a wide margin.

export const LIMITS = {
  nameMax: 50,
  gradeMin: 1,
  gradeMax: 13,
  ageMin: 4,
  ageMax: 18,
  interestsMax: 500,
  // Grade and age should roughly line up: grade 1 is about age 6, so
  // grade ≈ age - GRADE_AGE_OFFSET. The tolerance absorbs children working
  // above or below their level and the offset between UK year groups and US
  // grades. A gap wider than this is almost certainly a typo.
  gradeAgeTolerance: 3,
}

const GRADE_AGE_OFFSET = 5

// Returns { field: message } for every invalid field; empty object means valid.
export function validateForm(form) {
  const errors = {}

  const name = form.name.trim()
  if (!name) {
    errors.name = 'Please enter a name'
  } else if (name.length > LIMITS.nameMax) {
    errors.name = `Keep the name under ${LIMITS.nameMax} characters`
  }

  const grade = form.grade.trim()
  if (!grade) {
    errors.grade = 'Please enter a grade'
  } else if (!/^\d+$/.test(grade)) {
    errors.grade = 'Enter the grade as a number, e.g. 6'
  } else {
    const g = Number(grade)
    if (g < LIMITS.gradeMin || g > LIMITS.gradeMax) {
      errors.grade = `Grade must be between ${LIMITS.gradeMin} and ${LIMITS.gradeMax}`
    }
  }

  const age = form.age.trim()
  if (age) {
    if (!/^\d+$/.test(age)) {
      errors.age = 'Enter the age as a number'
    } else {
      const a = Number(age)
      if (a < LIMITS.ageMin || a > LIMITS.ageMax) {
        errors.age = `Age must be between ${LIMITS.ageMin} and ${LIMITS.ageMax}`
      }
    }
  }

  // Cross-check grade against age, but only once both fields are individually
  // valid, so we never stack this on top of a format or range error.
  if (age && !errors.grade && !errors.age) {
    const expected = Number(age) - GRADE_AGE_OFFSET
    if (Math.abs(Number(grade) - expected) > LIMITS.gradeAgeTolerance) {
      // Clamp only for the message, so we never suggest a grade like -1.
      const suggestion = Math.min(LIMITS.gradeMax, Math.max(LIMITS.gradeMin, expected))
      errors.grade = `Grade ${grade} doesn't match age ${age}. Expected around grade ${suggestion}.`
    }
  }

  if (form.interests.length > LIMITS.interestsMax) {
    errors.interests = `Keep interests under ${LIMITS.interestsMax} characters`
  }

  return errors
}
