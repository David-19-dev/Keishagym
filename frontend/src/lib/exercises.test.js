// Which demo an exercise gets: a 3D video when one has been produced for it, the two photos
// otherwise. The whole point of the arrangement is that the library can gain animations a few
// at a time, so "listed" and "not listed" both have to behave.
import { describe, it, expect, vi } from 'vitest'

vi.mock('./exercise-videos.js', () => ({ default: { Barbell_Squat: 'Barbell_Squat.webm' } }))

const { frames, stillSrc, videoSrc, EXIDX } = await import('./exercises.js')

// Where the media is served from is a build setting (VITE_EX_BASE / VITE_VID_BASE, a CDN in
// the mobile build), so these assert the file each helper points at, not the host.

const squat = EXIDX.Barbell_Squat
const bench = EXIDX['Barbell_Bench_Press_-_Medium_Grip']

describe('exercise media', () => {
  it('knows the dataset the app was built against', () => {
    expect(squat).toBeTruthy()
    expect(bench).toBeTruthy()
  })

  it('gives an exercise with an animation its video', () => {
    expect(videoSrc(squat).endsWith('Barbell_Squat.webm')).toBe(true)
  })

  it('gives every other exercise no video, so it falls back to the photos', () => {
    expect(videoSrc(bench)).toBeNull()
    expect(frames(bench)).toHaveLength(2)
    expect(frames(bench)[0].endsWith(bench.fr[0])).toBe(true)
  })

  it('still offers the photos of an exercise that has a video — the poster and the fallback', () => {
    expect(stillSrc(squat).endsWith(squat.fr[0])).toBe(true)
  })

  it('leaves a custom exercise (no media at all) blank rather than guessing', () => {
    const custom = { id: 'mine', n: 'My lift', bp: 'chest' }
    expect(videoSrc(custom)).toBeNull()
    expect(frames(custom)).toEqual([])
    expect(stillSrc(custom)).toBeNull()
  })

  it('survives a missing exercise', () => {
    expect(videoSrc(undefined)).toBeNull()
    expect(frames(undefined)).toEqual([])
  })
})
