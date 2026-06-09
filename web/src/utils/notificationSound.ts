let ctx: AudioContext | null = null

const getCtx = async (): Promise<AudioContext> => {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') await ctx.resume()
  return ctx
}

const playTone = async (freq: number, startOffset: number, duration: number, volume = 0.3) => {
  const ac = await getCtx()
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.connect(gain)
  gain.connect(ac.destination)
  osc.type = 'sine'
  osc.frequency.value = freq
  const t = ac.currentTime + startOffset
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(volume, t + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
  osc.start(t)
  osc.stop(t + duration)
}

export const playMessageSound = () => {
  playTone(1046.5, 0,   0.12).catch(() => {})
  playTone(1318.5, 0.1, 0.18).catch(() => {})
}

// Ringtone: repeating ring pattern, returns stop function
export const startRingtone = (): (() => void) => {
  let stopped = false

  const ring = async () => {
    while (!stopped) {
      await playTone(880, 0,   0.15, 0.25)
      await playTone(880, 0.2, 0.15, 0.25)
      await new Promise((r) => setTimeout(r, 2800))
    }
  }

  ring().catch(() => {})
  return () => { stopped = true }
}
