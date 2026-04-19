/** Short warning beep — respects mute via `enabled`. */

let audioCtx: AudioContext | null = null

function ctx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

export function playWarningBeep(enabled: boolean) {
  if (!enabled) return
  try {
    const c = ctx()
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'square'
    o.frequency.value = 880
    g.gain.value = 0.04
    o.connect(g)
    g.connect(c.destination)
    o.start()
    o.stop(c.currentTime + 0.08)
  } catch {
    /* ignore autoplay restrictions */
  }
}
