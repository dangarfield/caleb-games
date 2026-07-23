export const CATEGORIES = [
  {
    id: 'maths',
    name: 'Maths',
    color: 0x3498db,
    spineColor: '#3498db',
    section: '1A',
    series: [
      { name: 'Times Tables', volumes: 10, spineLabel: 'TT' },
      { name: 'Puzzle Maths', volumes: 10, spineLabel: 'PM' },
      { name: 'Shape & Space', volumes: 10, spineLabel: 'SS' },
      { name: 'Number Ninjas', volumes: 10, spineLabel: 'NN' },
    ]
  },
  {
    id: 'english',
    name: 'English',
    color: 0x8b4513,
    spineColor: '#a0522d',
    section: '1B',
    series: [
      { name: 'Grammar Gang', volumes: 10, spineLabel: 'GG' },
      { name: 'Spelling Stars', volumes: 10, spineLabel: 'SP' },
      { name: 'Story Writing', volumes: 10, spineLabel: 'SW' },
      { name: 'Reading Skills', volumes: 10, spineLabel: 'RS' },
    ]
  },
  {
    id: 'languages',
    name: 'Languages',
    color: 0xf39c12,
    spineColor: '#f39c12',
    section: '1C',
    series: [
      { name: 'French Fun', volumes: 10, spineLabel: 'FF' },
      { name: 'Spanish Steps', volumes: 10, spineLabel: 'ES' },
      { name: 'German Games', volumes: 10, spineLabel: 'DE' },
      { name: 'Mandarin Magic', volumes: 10, spineLabel: 'MM' },
    ]
  },
  {
    id: 'science',
    name: 'Science',
    color: 0x2ecc71,
    spineColor: '#2ecc71',
    section: '1D',
    series: [
      { name: 'Horrible Science', volumes: 10, spineLabel: 'HS' },
      { name: 'Experiments', volumes: 10, spineLabel: 'EX' },
      { name: 'Human Body', volumes: 10, spineLabel: 'HB' },
      { name: 'Earth & Space', volumes: 10, spineLabel: 'EA' },
    ]
  },
  {
    id: 'adventure',
    name: 'Adventure',
    color: 0xe74c3c,
    spineColor: '#e74c3c',
    section: '1E',
    series: [
      { name: 'Beast Quest', volumes: 10, spineLabel: 'BQ' },
      { name: 'Percy Jackson', volumes: 10, spineLabel: 'PJ' },
      { name: 'Alex Rider', volumes: 10, spineLabel: 'AR' },
      { name: 'Wings of Fire', volumes: 10, spineLabel: 'WF' },
    ]
  },
  {
    id: 'superheroes',
    name: 'Super Heroes',
    color: 0x9b59b6,
    spineColor: '#9b59b6',
    section: '1F',
    series: [
      { name: 'Marvel Adventures', volumes: 10, spineLabel: 'MA' },
      { name: 'DC Super Kids', volumes: 10, spineLabel: 'DC' },
      { name: 'Super Powers', volumes: 10, spineLabel: 'SP' },
      { name: 'Hero Academy', volumes: 10, spineLabel: 'HA' },
    ]
  },
  {
    id: 'animals',
    name: 'Animals',
    color: 0xe67e22,
    spineColor: '#e67e22',
    section: '2A',
    series: [
      { name: 'Animal Ark', volumes: 10, spineLabel: 'AA' },
      { name: 'Warrior Cats', volumes: 10, spineLabel: 'WC' },
      { name: 'Puppy Place', volumes: 10, spineLabel: 'PP' },
      { name: 'Dinosaur Cove', volumes: 10, spineLabel: 'DC' },
    ]
  },
  {
    id: 'comics',
    name: 'Comics',
    color: 0x1abc9c,
    spineColor: '#1abc9c',
    section: '2B',
    series: [
      { name: 'Dog Man', volumes: 10, spineLabel: 'DM' },
      { name: 'Amulet', volumes: 10, spineLabel: 'AM' },
      { name: 'Hilo', volumes: 10, spineLabel: 'HI' },
      { name: 'Bone', volumes: 10, spineLabel: 'BN' },
    ]
  },
  {
    id: 'sport',
    name: 'Sport',
    color: 0x27ae60,
    spineColor: '#27ae60',
    section: '2C',
    series: [
      { name: 'Football Academy', volumes: 10, spineLabel: 'FA' },
      { name: 'Kickball Kings', volumes: 10, spineLabel: 'KK' },
      { name: 'Olympic Dreams', volumes: 10, spineLabel: 'OD' },
      { name: 'Racing Stars', volumes: 10, spineLabel: 'RS' },
    ]
  },
  {
    id: 'funny',
    name: 'Funny Books',
    color: 0xf1c40f,
    spineColor: '#f1c40f',
    section: '2D',
    series: [
      { name: 'Wimpy Kid', volumes: 10, spineLabel: 'WK' },
      { name: 'Captain Underpants', volumes: 10, spineLabel: 'CU' },
      { name: 'Tom Gates', volumes: 10, spineLabel: 'TG' },
      { name: 'Bad Guys', volumes: 10, spineLabel: 'BG' },
    ]
  },
  {
    id: 'history',
    name: 'History',
    color: 0x616161,
    spineColor: '#757575',
    section: '2E',
    series: [
      { name: 'Horrible Histories', volumes: 10, spineLabel: 'HH' },
      { name: 'Ancient Egypt', volumes: 10, spineLabel: 'AE' },
      { name: 'Roman Mysteries', volumes: 10, spineLabel: 'RM' },
      { name: 'Viking Quest', volumes: 10, spineLabel: 'VQ' },
    ]
  },
  {
    id: 'space',
    name: 'Space & Robots',
    color: 0x5b2c6f,
    spineColor: '#7d3c98',
    section: '2F',
    series: [
      { name: 'Galaxy Zack', volumes: 10, spineLabel: 'GZ' },
      { name: 'Star Wars', volumes: 10, spineLabel: 'SW' },
      { name: 'Robots Rule', volumes: 10, spineLabel: 'RR' },
      { name: 'Space Taxi', volumes: 10, spineLabel: 'ST' },
    ]
  },
];

export function generateBooks() {
  const books = [];

  for (const cat of CATEGORIES) {
    for (const series of cat.series) {
      for (let vol = 1; vol <= series.volumes; vol++) {
        books.push(makeBook(cat, series, vol));
      }
    }
  }

  return books.sort(() => Math.random() - 0.5);
}

function makeBook(cat, series, vol) {
  return {
    id: `${cat.id}-${series.spineLabel}-${vol}`,
    title: `${series.name} #${vol}`,
    series: series.name,
    seriesLabel: series.spineLabel,
    volume: vol,
    totalVolumes: series.volumes,
    category: cat.id,
    categoryName: cat.name,
    section: cat.section,
    color: cat.color,
    spineColor: cat.spineColor,
    shelved: false,
    correctShelf: null,
  };
}

export function getSeriesForCategory(categoryId) {
  const cat = CATEGORIES.find(c => c.id === categoryId);
  return cat ? cat.series : [];
}

export function getCategoryById(id) {
  return CATEGORIES.find(c => c.id === id);
}
