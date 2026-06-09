const PALETTE = [
  '#4f46e5', // indigo-600
  '#7c3aed', // violet-600
  '#059669', // emerald-600
  '#e11d48', // rose-600
  '#d97706', // amber-600
  '#0ea5e9', // sky-500
  '#ea580c', // orange-600
  '#0d9488', // teal-600
  '#db2777', // pink-600
  '#0891b2', // cyan-600
  '#65a30d', // lime-600
  '#9333ea', // purple-600
  '#dc2626', // red-600
  '#2563eb', // blue-600
  '#c026d3', // fuchsia-600
  '#16a34a', // green-600
]

export function aliasColor(name: string): string {
  let hash = 5381
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 33) ^ name.charCodeAt(i)
    hash = hash >>> 0
  }
  return PALETTE[hash % PALETTE.length]
}
