import createEventId, {
  freeUpEventId,
  availableIds
} from '../src/public/client/event-id';

describe('event ids', () => {
  test('create', () => {
    const eventId1 = createEventId();
    expect(eventId1).toBe(0);
    const eventId2 = createEventId();
    expect(eventId2).toBe(1);
  });

  test('free up', () => {
    const eventId = createEventId();
    freeUpEventId(eventId);
    expect(availableIds[0]).toBe(eventId);
  });
});
