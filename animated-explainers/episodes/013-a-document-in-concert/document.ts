import {namedRange} from '../../shared/TextRun';

export const entities = {
  carroll: {name: 'Lewis Carroll', db: 86},
  photo: {name: 'Photography', db: 4},
  oxford: {name: 'Oxford', db: 143},
  alice: {name: 'Alice Liddell', db: 19},
  math: {name: 'Mathematics', db: 112},
  book: {name: 'Alice’s Adventures in Wonderland', db: 17},
};
export type Entity = keyof typeof entities;
export const entityIds = Object.keys(entities) as Entity[];
export const sections = ['Early life', 'Oxford years', 'Photography', 'Literary career', 'Legacy'];
type Reference = [Entity, string];
function passage(number: number, text: string, refs: Reference[]) {
  const id = String(number).padStart(2, '0');
  return {id, section: sections[Math.floor((number-1)/2)], text,
    ranges: refs.map(([entity, phrase]) => ({...namedRange(id+'-'+entity,text,phrase), entity, phrase}))};
}
export const passages = [
  passage(1, 'Dodgson filled pages with puzzles.', [['carroll','Dodgson']]),
  passage(2, 'Mathematics shaped his games.', [['math','Mathematics']]),
  passage(3, 'The mathematician taught at Oxford.', [['carroll','The mathematician'],['oxford','Oxford']]),
  passage(4, 'Between lectures he took up photography.', [['photo','photography']]),
  passage(5, 'Alice Liddell sat for portraits.', [['alice','Alice Liddell']]),
  passage(6, 'Camera work called for patience.', [['photo','Camera work']]),
  passage(7, 'The author told Alice Liddell a tale.', [['carroll','The author'],['alice','Alice Liddell']]),
  passage(8, 'Carroll published the Wonderland book.', [['carroll','Carroll'],['book','the Wonderland book']]),
  passage(9, 'Oxford remembers Lewis Carroll.', [['oxford','Oxford'],['carroll','Lewis Carroll']]),
  passage(10, 'His photographic practice still draws study.', [['photo','photographic practice']]),
];
export type Passage = typeof passages[number];
export const mentions = (id: Entity) => passages.flatMap(block => block.ranges.filter(range => range.entity === id));
export const contains = (block: Passage, id?: Entity) => block.ranges.some(range => range.entity === id);
export const normalHeight = 55;
export function layout(focus?: Entity, progress = 0) {
  let bottom = 58;
  return passages.map(block => {
    const y = bottom;
    const height = normalHeight * (focus && !contains(block,focus) ? 1-progress : 1);
    bottom += height;
    return {block, y, height};
  });
}
