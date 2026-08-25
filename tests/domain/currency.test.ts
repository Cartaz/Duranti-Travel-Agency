import assert from 'node:assert/strict'
import test from 'node:test'
import {
  convertMinorByRate,
  majorAmountToMinor,
  minorAmountToMajor,
  normalizeCurrencyCode,
  normalizeFxRate,
} from '../../src/lib/currency.ts'

test('normalizes supported ISO currency codes', () => {
  assert.equal(normalizeCurrencyCode(' eur '), 'EUR')
  assert.throws(() => normalizeCurrencyCode('EU'), /tre lettere/)
})

test('converts major amounts to exact minor units without floating point math', () => {
  assert.equal(majorAmountToMinor('12,50', 'EUR'), 1250)
  assert.equal(majorAmountToMinor('100', 'JPY'), 100)
  assert.throws(() => majorAmountToMinor('12.345', 'EUR'), /massimo 2 cifre decimali/)
  assert.throws(() => majorAmountToMinor('0', 'EUR'), /maggiore di zero/)
})

test('converts persisted minor units back to canonical major strings', () => {
  assert.equal(minorAmountToMajor(1250, 'EUR'), '12.50')
  assert.equal(minorAmountToMajor(100, 'JPY'), '100')
  assert.throws(() => minorAmountToMajor(-1, 'EUR'), /persistito non valido/)
})

test('normalizes FX rates deterministically', () => {
  assert.equal(normalizeFxRate(' 1,2500 '), '1.25')
  assert.equal(normalizeFxRate('0002.500000'), '2.5')
  assert.throws(() => normalizeFxRate('0'), /maggiore di zero/)
})

test('converts minor units with integer half-up rounding', () => {
  const result = convertMinorByRate(1000, 'EUR', 'USD', '1.2345')
  assert.deepEqual(result, { rate: '1.2345', convertedAmountMinor: 1235 })
  assert.throws(() => convertMinorByRate(100, 'EUR', 'EUR', '1'), /due valute diverse/)
})
