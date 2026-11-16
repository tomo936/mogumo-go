import { expect, test } from 'vitest'
import { homePinElement } from './homePin.ts'

test('自宅のピン: 家の絵と「おうち」の札。お店のピンと別の見た目（home-marker）', () => {
  const el = homePinElement()
  expect(el.className).toBe('home-marker')
  expect(el.querySelector('img')?.getAttribute('alt')).toBe('')
  expect(el.querySelector('.home-marker__label')?.textContent).toBe('おうち')
  expect(el.getAttribute('aria-label')).toBe('自宅')
})

test('押しても地図（お店を選ぶ処理）に伝わらず、ぽんと弾むだけ', () => {
  const el = homePinElement()
  let reached = false
  const parent = document.createElement('div')
  parent.addEventListener('click', () => (reached = true))
  parent.appendChild(el)
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  expect(reached).toBe(false)
  expect(el.classList.contains('home-marker--bounce')).toBe(true)
})
