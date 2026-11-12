import { describe, expect, it } from 'vitest';
import { podium, podiumOrder } from './podium.js';

const nets = (...values) => values.map((net, i) => ({ id: `p${i}`, net }));

describe('podium', () => {
  it('the top 3 winners, best first', () => {
    expect(podium(nets(-300, 150, 400, 90, 20, -360))).toEqual([
      { place: 1, net: 400, ids: ['p2'] },
      { place: 2, net: 150, ids: ['p1'] },
      { place: 3, net: 90, ids: ['p3'] },
    ]);
  });

  it('only players in profit: nobody at 0 or below', () => {
    expect(podium(nets(100, 0, -100))).toEqual([{ place: 1, net: 100, ids: ['p0'] }]);
    expect(podium(nets(0, 0))).toEqual([]);
    expect(podium([])).toEqual([]);
  });

  it('fewer than 3 winners: only them', () => {
    expect(podium(nets(200, 100, -300)).map((p) => p.place)).toEqual([1, 2]);
  });

  it('ties share the place, and the next place counts everyone ahead', () => {
    expect(podium(nets(200, 200, 100, 50))).toEqual([
      { place: 1, net: 200, ids: ['p0', 'p1'] },
      { place: 3, net: 100, ids: ['p2'] },
    ]);
    expect(podium(nets(300, 100, 100, 100, 50))).toEqual([
      { place: 1, net: 300, ids: ['p0'] },
      { place: 2, net: 100, ids: ['p1', 'p2', 'p3'] },
    ]);
    expect(podium(nets(300, 200, 100, 100))).toEqual([
      { place: 1, net: 300, ids: ['p0'] },
      { place: 2, net: 200, ids: ['p1'] },
      { place: 3, net: 100, ids: ['p2', 'p3'] },
    ]);
  });

  it('three tied for 1st take the podium', () => {
    expect(podium(nets(100, 100, 100, 50))).toEqual([{ place: 1, net: 100, ids: ['p0', 'p1', 'p2'] }]);
  });

  it('is laid out 2nd, 1st, 3rd: 1st always in the middle, an empty spot for a missing place', () => {
    const place = (spots) => spots.map((p) => p?.place ?? null);
    expect(place(podiumOrder(podium(nets(400, 150, 90))))).toEqual([2, 1, 3]);
    expect(place(podiumOrder(podium(nets(200, 200, 100))))).toEqual([null, 1, 3]);
    expect(place(podiumOrder(podium(nets(200, 100))))).toEqual([2, 1, null]);
    expect(place(podiumOrder(podium(nets(100))))).toEqual([1]);
    expect(podiumOrder([])).toEqual([]);
  });
});
