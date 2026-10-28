import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import facts from '../src/data/reading-facts.json' with { type: 'json' }

/**
 * The claims on the page must come from the generated file, and the generated
 * file must come from sources. These tests are what stop a number being typed
 * into the component later "just for now".
 */
const section = readFileSync(new URL('../src/sections/WhyChoosing.tsx', import.meta.url), 'utf8')

test('every statistic on the page is within the staleness rule', () => {
  const thisYear = Number(facts.generatedOn.slice(0, 4))
  for (const s of facts.statistics) {
    assert.ok(thisYear - s.dataYear <= 3,
      `${s.id} has data from ${s.dataYear}, which the rule should have rejected`)
  }
  // And the rule really bites: this run rejected one.
  assert.ok(facts.rejectedSources.length > 0,
    'nothing was rejected — either the rule stopped working or the sources changed')
})

test('every study declares its design and carries a limitation', () => {
  assert.ok(facts.studies.length > 0)
  for (const s of facts.studies) {
    assert.ok(s.design, `${s.id} has no design`)
    assert.ok(s.limitation && s.limitation.length > 40, `${s.id} has no real limitation`)
    assert.ok(s.citation, `${s.id} has no citation`)
    // Every study here is observational, and the page says the word.
    assert.equal(s.design, 'correlational', `${s.id} claims a design this page is not set up to present`)
  }
})

test('the page prints the design next to the claim, not in a footnote', () => {
  // The whole point: "correlational" is rendered beside the finding. If someone
  // removes it to make the copy flow better, this fails.
  assert.match(section, /\{s\.design\}/, 'the section no longer renders each study design')
  assert.match(section, /What it does not show/, 'the section no longer renders the limitation')
})

test('no number is typed into the section — they all come from the data', () => {
  // Strip the comment block, then look for bare numerals in the JSX. The
  // failure this prevents is subtle and common: someone updates the source,
  // the JSON changes, and a hard-coded "2 books a year" in the copy silently
  // disagrees with the chart beside it.
  const body = section.replace(/\/\*[\s\S]*?\*\//g, '')
  const suspicious = [...body.matchAll(/>[^<>{}]*\b(\d{2,})\b[^<>{}]*</g)]
    .map((m) => m[1])
    // 52 weeks is a property of the calendar, not of a source.
    .filter((n) => n !== '52')
  assert.deepEqual(suspicious, [],
    `hard-coded numbers in the copy: ${suspicious.join(', ')}`)
})

test('the refusals are on the page, not just in the script', () => {
  assert.ok(facts.refused.length >= 3)
  assert.match(section, /facts\.refused\.map/, 'the page stopped showing what it could not source')
  for (const r of facts.refused) {
    assert.ok(r.why.length > 60, `"${r.wanted}" has no real explanation`)
    assert.ok(r.whatGetsQuotedInstead, `"${r.wanted}" does not say what gets quoted instead`)
  }
})

test('the headline number nobody can source is still refused', () => {
  // If this ever starts passing, someone found a real source — and should
  // delete this test deliberately rather than let the refusal quietly vanish.
  const worldTotal = facts.refused.find((r) => /worldwide each year/.test(r.wanted))
  assert.ok(worldTotal, 'the global-titles refusal disappeared from the data')
  assert.ok(!JSON.stringify(facts.derived).includes('2600000'),
    'a global titles figure appeared in the derived numbers')
})
