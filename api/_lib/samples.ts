import type { Mode, Slot, Stop, Tag } from '../../src/engine/index.js'

type Row = [name: string, day: number, slot: Slot, cost: number, tags: Tag[], note: string]
export interface Sample {
  destination: string
  country: string
  mode: Mode
  hours: number
  journeyCost: number
  stayPerNight: number
  rows: Row[]
}

/** Pre-written sample plans used when the AI draft fails (and by demo bots). */
export const SAMPLES: Sample[] = [
  { destination: 'Gokarna', country: 'India', mode: 'train', hours: 7, journeyCost: 3000, stayPerNight: 1500, rows: [
    ['Om Beach sunset', 1, 'evening', 0, ['beach', 'nature'], 'Golden hour on the curved bay.'],
    ['Coastal cliff walk', 1, 'afternoon', 0, ['beach', 'long_walk', 'nature'], 'Five-beach trail over the headlands.'],
    ['Mahabaleshwar Temple', 2, 'morning', 100, ['culture'], 'Old shore temple in town.'],
    ['Half Moon Beach kayak', 2, 'afternoon', 800, ['beach', 'adventure'], 'Paddle along a quiet cove.'],
    ['Beach shack dinner', 2, 'evening', 700, ['food', 'beach'], 'Fresh catch, feet in the sand.'],
    ['Paradise Beach boat', 3, 'morning', 600, ['beach', 'nature'], 'Short boat hop to a hidden beach.'],
  ] },
  { destination: 'Ooty', country: 'India', mode: 'car', hours: 5.5, journeyCost: 3500, stayPerNight: 2500, rows: [
    ['Botanical Gardens', 1, 'afternoon', 100, ['nature'], 'Terraced gardens, easy strolls.'],
    ['Ooty Lake boating', 1, 'evening', 300, ['nature', 'crowded'], 'Busy but pretty at dusk.'],
    ['Nilgiri toy train', 2, 'morning', 600, ['hills', 'culture'], 'Heritage rail through tea hills.'],
    ['Tea factory tasting', 2, 'afternoon', 200, ['food', 'hills'], 'Fresh brews and a short tour.'],
    ['Doddabetta Peak', 3, 'morning', 100, ['hills', 'nature'], 'Highest point in the Nilgiris.'],
    ['Charring Cross market', 3, 'afternoon', 500, ['shopping', 'food'], 'Chocolates, spices, woollens.'],
  ] },
  { destination: 'Wayanad', country: 'India', mode: 'car', hours: 2.5, journeyCost: 1500, stayPerNight: 2000, rows: [
    ['Edakkal Caves', 1, 'morning', 100, ['culture', 'long_walk', 'hills'], 'Steep climb to ancient carvings.'],
    ['Pookode Lake', 1, 'afternoon', 200, ['nature'], 'Pedal boats under the forest.'],
    ['Banasura Dam', 2, 'morning', 200, ['nature', 'hills'], 'Islands in a huge reservoir.'],
    ['Spice plantation walk', 2, 'afternoon', 300, ['nature', 'food'], 'Pepper, cardamom and coffee.'],
    ['Soochipara Falls', 3, 'morning', 150, ['nature', 'adventure'], 'Three-tier waterfall in the woods.'],
    ['Kerala sadhya lunch', 3, 'afternoon', 400, ['food', 'culture'], 'A full banana-leaf meal.'],
  ] },
  { destination: 'Goa', country: 'India', mode: 'train', hours: 9, journeyCost: 3000, stayPerNight: 2500, rows: [
    ['Fontainhas walk', 1, 'afternoon', 0, ['culture', 'city', 'long_walk'], 'Colourful Latin quarter lanes.'],
    ['Riverside dinner', 1, 'evening', 1200, ['food'], 'Goan curry by the Mandovi.'],
    ['Palolem Beach', 2, 'morning', 0, ['beach', 'nature'], 'Calm water, palm-lined bay.'],
    ['Spice farm lunch', 2, 'afternoon', 800, ['food', 'nature'], 'Buffet among the spice trees.'],
    ['Night market', 2, 'night', 500, ['shopping', 'nightlife', 'crowded', 'late_night'], 'Saturday market buzz.'],
    ['Dudhsagar Falls trip', 3, 'morning', 1500, ['nature', 'adventure', 'early_start'], 'Jeep ride to a giant waterfall.'],
  ] },
  { destination: 'Munnar', country: 'India', mode: 'bus', hours: 8, journeyCost: 1800, stayPerNight: 2200, rows: [
    ['Tea Museum', 1, 'afternoon', 150, ['culture', 'hills'], 'How the hills became tea country.'],
    ['Mattupetty Dam', 1, 'evening', 200, ['nature'], 'Calm lake ringed by hills.'],
    ['Eravikulam Park', 2, 'morning', 400, ['nature', 'hills', 'crowded'], 'Spot the Nilgiri tahr.'],
    ['Plantation picnic', 2, 'afternoon', 300, ['food', 'hills'], 'Lunch among the tea rows.'],
    ['Top Station sunrise', 3, 'morning', 200, ['hills', 'early_start'], 'Clouds below you at dawn.'],
    ['Spice market', 3, 'afternoon', 400, ['shopping', 'food'], 'Cardamom and pepper to take home.'],
  ] },
  { destination: 'Dubai', country: 'United Arab Emirates', mode: 'flight', hours: 7, journeyCost: 20000, stayPerNight: 5000, rows: [
    ['JBR Beach', 1, 'afternoon', 0, ['beach'], 'Sand and skyline in one view.'],
    ['Dubai Mall evening', 1, 'evening', 1500, ['city', 'shopping', 'crowded'], 'Fountain show and window shopping.'],
    ['Old Dubai food walk', 2, 'morning', 1500, ['food', 'culture', 'long_walk'], 'Souks, abra ride and street snacks.'],
    ['Desert safari', 2, 'evening', 3000, ['adventure', 'nature', 'late_night'], 'Dunes, dinner and a starlit camp.'],
    ['Museum of the Future', 3, 'morning', 2500, ['culture', 'city'], 'Bold architecture and exhibits.'],
    ['Creek dhow cruise', 3, 'evening', 1500, ['food', 'culture'], 'Dinner on the water.'],
  ] },
  { destination: 'Bangkok', country: 'Thailand', mode: 'flight', hours: 6, journeyCost: 18000, stayPerNight: 3000, rows: [
    ['Grand Palace', 1, 'morning', 1200, ['culture', 'crowded'], 'Gilded halls and temples.'],
    ['Chinatown street food', 1, 'evening', 800, ['food', 'city', 'late_night'], 'Yaowarat after dark.'],
    ['Floating market', 2, 'morning', 1000, ['culture', 'food', 'early_start'], 'Boats piled with fruit.'],
    ['Wat Arun at sunset', 2, 'evening', 300, ['culture'], 'Temple of Dawn across the river.'],
    ['Chatuchak market', 3, 'morning', 1500, ['shopping', 'crowded', 'long_walk'], 'Thousands of stalls.'],
    ['Rooftop dinner', 3, 'evening', 2500, ['city', 'nightlife', 'food'], 'Skyline views over the river.'],
  ] },
  { destination: 'Bali', country: 'Indonesia', mode: 'flight', hours: 9, journeyCost: 26000, stayPerNight: 3500, rows: [
    ['Ubud rice terraces', 1, 'afternoon', 300, ['nature', 'hills'], 'Tegallalang green steps.'],
    ['Ubud market', 1, 'evening', 800, ['shopping', 'culture'], 'Crafts and sarongs.'],
    ['Mount Batur sunrise', 2, 'morning', 3000, ['adventure', 'hills', 'early_start', 'long_walk'], 'Volcano hike before dawn.'],
    ['Warung lunch', 2, 'afternoon', 500, ['food'], 'Nasi campur, simple and good.'],
    ['Uluwatu temple', 3, 'evening', 600, ['culture', 'beach'], 'Cliff temple and kecak dance.'],
    ['Seminyak beach', 3, 'afternoon', 0, ['beach'], 'Long sand, big sunsets.'],
  ] },
  { destination: 'Singapore', country: 'Singapore', mode: 'flight', hours: 6, journeyCost: 22000, stayPerNight: 7000, rows: [
    ['Gardens by the Bay', 1, 'evening', 1500, ['nature', 'city'], 'Supertree light show.'],
    ['Hawker centre dinner', 1, 'night', 600, ['food', 'late_night'], 'Satay and chicken rice.'],
    ['Sentosa beaches', 2, 'afternoon', 500, ['beach'], 'Island day by the sea.'],
    ['Chinatown heritage', 2, 'morning', 300, ['culture', 'city'], 'Temples and shophouses.'],
    ['Orchard Road', 3, 'afternoon', 2000, ['shopping', 'city', 'crowded'], 'Mall-lined boulevard.'],
    ['Southern Ridges walk', 3, 'morning', 0, ['nature', 'long_walk'], 'Canopy bridges above the trees.'],
  ] },
  { destination: 'Leh', country: 'India', mode: 'flight', hours: 6, journeyCost: 14000, stayPerNight: 2500, rows: [
    ['Leh Palace', 1, 'afternoon', 100, ['culture', 'hills'], 'Rest day to acclimatise, gentle visit.'],
    ['Shanti Stupa sunset', 1, 'evening', 0, ['hills', 'culture'], 'Views across the valley.'],
    ['Thiksey Monastery', 2, 'morning', 100, ['culture', 'early_start'], 'Morning prayers at dawn.'],
    ['Leh market', 2, 'evening', 800, ['shopping', 'food'], 'Momos and pashmina.'],
    ['Pangong Lake day', 3, 'morning', 3500, ['nature', 'adventure', 'early_start'], 'Long drive to the blue lake.'],
    ['Magnetic Hill stop', 3, 'afternoon', 0, ['hills'], 'The road that pulls uphill.'],
  ] },
]

export function sampleFor(destination: string, country: string): Sample | undefined {
  const n = destination.toLowerCase().trim()
  return SAMPLES.find((s) => s.country === country && (s.destination.toLowerCase() === n || n.includes(s.destination.toLowerCase())))
}

export function sampleStops(s: Sample, days: number, idPrefix: string): Stop[] {
  return s.rows
    .map(([name, day, slot, cost, tags, note], i) => ({
      id: `${idPrefix}${i}`,
      name,
      day: Math.min(day, days),
      slot,
      cost,
      tags,
      note,
    }))
    .filter((_, i, arr) => arr.slice(0, i + 1).filter((x) => x.day === arr[i].day).length <= 4)
}
